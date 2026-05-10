# crux

A CLI that wraps your test runner and emits a compact, failures-only
summary. Includes an MCP server (`crux-mcp`) for agents.

## What it solves

Test runner output is loud. A 200-test suite with 3 failures prints
hundreds of lines of pass/fail status, ANSI escape codes, and stack
traces stuffed with `node_modules` frames. Agents parsing that output
spend tokens on noise. Humans skim past it.

crux strips the output to one summary line plus one block per failure
with file:line and the matcher diff. Exit code matches the runner's,
unchanged.

## Proof

Raw vitest:

```
$ npx vitest run
 ✓ tests/users.test.ts (15) 124ms
 ✓ tests/orders.test.ts (29) 412ms
[...30 more lines...]
 ✗ tests/auth.test.ts > rejects invalid tokens
   AssertionError: expected 401 to be 500
     at Object.<anonymous> (tests/auth.test.ts:42:17)
     at runMicrotasks (node:internal/process/task_queues:96:5)
     at processTicksAndRejections (node:internal/process/task_queues:81:21)
[...more frames, summary, watch hint...]
```

crux:

```
$ crux
3 of 47 tests failed in 1.28s

### FAIL tests/auth.test.ts:42 - auth > rejects invalid tokens
expected 401, received 500

### FAIL tests/billing.test.ts:23 - billing > applies discount
expected 50, received 60

### FAIL tests/users.test.ts:88 - users > deletes own profile
expected true, received false
```

Same exit code. Same test outcome. Less noise.

Measured against `claude-opus-4-7` via Anthropic's `count_tokens` API
(ANSI-stripped) across 7 real OSS projects (22 to 4,456 tests,
including [honojs/hono](https://github.com/honojs/hono),
[vuejs/core](https://github.com/vuejs/core), and
[nuxt/nuxt](https://github.com/nuxt/nuxt)) plus 3 controlled failure
fixtures: **78% to 99.9% token reduction** (median ~89%). Compared to
other agent reduction strategies on the same hono run: `tail -200`
silently drops 2 of 4 failures, `vitest --reporter=json` is 1.39M
tokens (more than 2,100x crux), and a seven-step `jq` pipeline
produces several hundred to a few thousand tokens depending on the
truncation cap. crux is **662 tokens for the hono run**, smaller than
every alternative measured, with zero per-runner setup. Reduction
ratios reproduce within 1 percentage point on Sonnet 4.6 (with ~25%
fewer absolute tokens). Methodology, full table, and reproduce steps
in [`docs/report-v0.1.md`](docs/report-v0.1.md).

## Quickstart

```bash
npm install -g crux-cli
crux                                    # auto-detect, summarize
crux --json                             # machine-readable
crux --full                             # disable smart truncation
crux -- npx vitest run path/to/test.ts  # explicit command
```

Or use without a global install:

```bash
npx crux-cli           # CLI
npx --package=crux-cli crux-mcp   # MCP server
```

## Use with agents

crux ships two agent-integration templates. Copy the one your agent
reads into your own project so the agent prefers `crux` over invoking
the test runner directly:

- **Shell-using agents that read `AGENTS.md`** (Aider, Codex, and
  others following the convention): copy
  [`docs/AGENTS.md`](docs/AGENTS.md) to your project root.
- **Claude Code**: copy
  [`docs/skills/crux/`](docs/skills/crux/SKILL.md) to your project's
  `.claude/skills/` directory (or to `~/.claude/skills/` for global
  use). Step-by-step in
  [`docs/using-claude-code.md`](docs/using-claude-code.md).
- **MCP-using agents** (Claude Desktop, Cursor, Cline, others): one-time
  host registration of the `crux-mcp` server, no template copy needed.
  See [`docs/mcp-hosts.md`](docs/mcp-hosts.md).

## Supported runners (v0.1)

| Runner | Status |
|---|---|
| vitest | shipped |
| jest | planned (v0.2) |
| pytest | planned (v0.3) |
| cargo test | planned (v0.4) |
| go test | planned (v0.5) |

## JSON schema

`crux --json` and the MCP `run_tests` tool both emit a `cruxVersion: 1`
envelope. The schema is locked across v0.1 to v1.x; field additions
are additive, removals and type changes are major-version-only.

```jsonc
{
  "cruxVersion": 1,
  "runner": "vitest",
  "exitCode": 1,
  "summary": { "passed": 44, "failed": 3, "skipped": 0, "total": 47, "durationMs": 1280 },
  "failures": [
    {
      "testName": "auth > rejects invalid tokens",
      "filePath": "tests/auth.test.ts",
      "line": 42,
      "column": 17,
      "message": "expected 401 but received 500",
      "expected": "401",
      "received": "500",
      "topFrame": { "filePath": "src/auth.ts", "line": 18, "column": null }
      // expectedTruncated and receivedTruncated are optional fields,
      // present and set to true when the sanitize pass modified the
      // value (collapsed a .rejects/.resolves diff body, stripped
      // Symbol-keyed graphs, or hard-capped at 2,048 chars). Omitted
      // entirely when no modification occurred. Bypass via --full or
      // CRUX_FULL=1.
    }
  ],
  "runnerError": null
}
```

## Built on

Subprocess capture and replay for crux's own test suite uses
[shell-cassette](https://github.com/slgoodrich/shell-cassette).
Recommended for crux-using agents that need replayable test
invocations.

## License

MIT.
