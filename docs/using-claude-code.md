# Using crux with Claude Code

Claude Code has two ways to use crux: as a CLI command (default in
shell mode), or as an MCP server (registered per
[`docs/mcp-hosts.md`](mcp-hosts.md)).

The optional Claude Code skill at `docs/skills/crux/SKILL.md`
improves Claude Code's CLI usage by teaching it when to reach for
`crux` over the raw runner.

## What the skill does

When installed, the skill activates whenever Claude Code's session
matches its description trigger (running tests, debugging failing
tests, asking about test output). On activation, Claude Code prefers
`crux` over invoking the test runner directly.

The skill is host-specific to Claude Code. The host-neutral
equivalent is [`AGENTS.md`](AGENTS.md), intended to be copied into
the user's project root.

## Install

Once `crux-cli` is installed (`npm install -g crux-cli` or via npx),
copy the skill directory to one of Claude Code's skills locations:

```bash
# global (applies to every Claude Code session)
mkdir -p ~/.claude/skills
cp -r node_modules/crux-cli/docs/skills/crux ~/.claude/skills/

# or, project-scoped (only this project)
mkdir -p ./.claude/skills
cp -r node_modules/crux-cli/docs/skills/crux ./.claude/skills/
```

After install, the path on disk is `~/.claude/skills/crux/SKILL.md`
or `./.claude/skills/crux/SKILL.md`. Claude Code auto-discovers
skills in those locations on the next session start.

## Verify

Open a Claude Code session in a project that has tests. Ask "run the
tests". Claude Code's response should mention or invoke `crux`.

If the skill does not activate, the session may not match the trigger
description. Tweak the description in your local copy of
`~/.claude/skills/crux/SKILL.md` (the `description:` field in the
frontmatter) to broaden or narrow the match.

## Tweaking the trigger

Open `~/.claude/skills/crux/SKILL.md`. The frontmatter starts:

```
description: This skill should be used when the user asks to "run the tests", ...
```

- **Activates too often** (e.g., on unrelated topics): add a more
  specific qualifier ("when running vitest specifically", "after
  writing a test").
- **Activates too rarely** (e.g., doesn't fire when expected): remove
  qualifiers or add more trigger phrases the user actually uses.

Reloading Claude Code picks up the new description.
