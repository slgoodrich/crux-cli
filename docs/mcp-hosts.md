# MCP host configuration

`crux-mcp` is the MCP server companion to `crux`. It exposes one tool,
`run_tests`, which runs the project's test suite and returns the same
JSON shape as `crux --json`.

MCP hosts spawn `crux-mcp` as a child process and discover its tools
via the MCP handshake. Each host has its own config file; the snippets
below register `crux-mcp` once per host. After registration, the
`run_tests` tool is available in agentic sessions automatically.

Two invocation forms are shown for each host:

- **Direct** uses `crux-mcp` from your `PATH`. Requires
  `npm install -g crux-cli`.
- **npx** uses `npx -y --package=crux-cli crux-mcp` and does not
  require a global install. Slightly slower per session (npm resolves
  the package on first run).

---

## Claude Desktop

Config file location:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Direct:

```json
{
  "mcpServers": {
    "crux": {
      "command": "crux-mcp"
    }
  }
}
```

npx:

```json
{
  "mcpServers": {
    "crux": {
      "command": "npx",
      "args": ["-y", "--package=crux-cli", "crux-mcp"]
    }
  }
}
```

After saving, restart Claude Desktop. Verify in Settings -> Developer
-> MCP Servers that `crux` appears with the `run_tests` tool listed.

---

## Claude Code (CLI)

Use the `claude mcp add` command. Run it **from inside the project
directory where you want crux available**:

```bash
cd /path/to/your/project

# Direct (crux-mcp on PATH)
claude mcp add crux crux-mcp

# npx (no global install needed)
claude mcp add crux -- npx -y --package=crux-cli crux-mcp
```

The default scope is `local` — the registration is scoped to the
current project (written to `~/.claude.json` under that project's
path). `crux` is only available when you launch `claude` from that
directory or its descendants. Run the command once per project where
you want crux.

To make crux available **globally across every project**, use the
`-s user` flag:

```bash
claude mcp add crux crux-mcp -s user
```

To **share the registration via git** (so teammates pick it up
automatically), use `-s project` — this writes to a `.mcp.json` file
at the project root that you can commit:

```bash
claude mcp add crux crux-mcp -s project
```

Verify the registration:

```bash
claude mcp list
```

`crux` should appear in the list. In a Claude Code session, the
`run_tests` tool is available to the agent automatically.

The underlying entry shape is the same in either scope:

```jsonc
{
  "mcpServers": {
    "crux": {
      "type": "stdio",
      "command": "crux-mcp",
      "args": [],
      "env": {}
    }
  }
}
```

---

## Cursor

Cursor supports project-level and global MCP configuration.

- Project-level: `.cursor/mcp.json` in the project root (applies to
  that project only).
- Global: `~/.cursor/mcp.json` in your home directory (applies across
  all projects).

Direct:

```json
{
  "mcpServers": {
    "crux": {
      "command": "crux-mcp"
    }
  }
}
```

npx:

```json
{
  "mcpServers": {
    "crux": {
      "command": "npx",
      "args": ["-y", "--package=crux-cli", "crux-mcp"]
    }
  }
}
```

After saving, reload Cursor. Verify that `crux` appears in Cursor's
MCP server list (Settings -> Features -> MCP Servers) and that the
`run_tests` tool is shown.

---

## Cline (VSCode extension)

Cline stores MCP server config in `cline_mcp_settings.json`. To reach
it from within VSCode: open the Cline panel, click the MCP Servers
icon, go to the Configure tab, then click "Configure MCP Servers".

Default file paths:

- macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

Add an entry under `mcpServers`:

Direct:

```json
{
  "mcpServers": {
    "crux": {
      "command": "crux-mcp",
      "args": [],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

npx:

```json
{
  "mcpServers": {
    "crux": {
      "command": "npx",
      "args": ["-y", "--package=crux-cli", "crux-mcp"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

After saving, reload the VSCode window (`Developer: Reload Window`).
Verify by opening a Cline conversation and checking that `run_tests`
appears in the tool list.

---

## Generic MCP host

Any MCP host that supports stdio-transport server config can register
`crux-mcp`. The general shape is:

```json
{
  "mcpServers": {
    "crux": {
      "command": "crux-mcp"
    }
  }
}
```

Or with npx:

```json
{
  "mcpServers": {
    "crux": {
      "command": "npx",
      "args": ["-y", "--package=crux-cli", "crux-mcp"]
    }
  }
}
```

The host spawns `crux-mcp` as a child process on stdio. The MCP
handshake (`initialize` + `tools/list`) discovers the `run_tests` tool
automatically. No flags or arguments are required; the binary is
self-contained.

If your host accepts a `cwd` field in the spawn block, set it to the
project directory you want `crux-mcp` to run tests in. Otherwise, pass
an explicit `cwd` argument on each `run_tests` call.

Verify against your host's current documentation for the exact config
file path and field names; the `command`/`args` shape above is the
MCP standard and should transfer directly.

---

## Troubleshooting

**The host does not show `run_tests`.**

Confirm `crux-mcp` is on `PATH`:

```bash
# POSIX
which crux-mcp

# Windows
where crux-mcp
```

If you used the npx form, confirm it starts and waits on stdin:

```bash
npx -y --package=crux-cli crux-mcp
```

It should block (waiting for MCP input on stdin). If it exits
immediately, the package resolved incorrectly or the binary is broken.

**Tool calls fail with "no test runner detected".**

The MCP server inherits its cwd from wherever the host launched it.
If that directory is not the project root, detection fails. Pass an
explicit `cwd` field on the `run_tests` call, or configure the host to
spawn `crux-mcp` with the correct working directory.

**The host hangs after registering `crux`.**

Restart the host. If the hang reproduces, check `crux-mcp`'s stderr
output (most hosts surface it in a log panel). Set `CRUX_DEBUG=1` in
the spawn env to enable full stack traces:

```json
{
  "mcpServers": {
    "crux": {
      "command": "crux-mcp",
      "env": { "CRUX_DEBUG": "1" }
    }
  }
}
```

**`crux-mcp` exits immediately on Windows with the npx form.**

On Windows, `npx` may resolve to `npx.cmd`. Some hosts require
specifying the shell explicitly:

```json
{
  "mcpServers": {
    "crux": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "--package=crux-cli", "crux-mcp"]
    }
  }
}
```
