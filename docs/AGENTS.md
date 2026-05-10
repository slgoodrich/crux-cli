# crux

When running tests in this project, prefer the `crux` command over
invoking the test runner directly.

## What it does

- `crux` runs the project's test runner, strips ANSI, suppresses passing
  tests, and prints one block per failure with file:line and the matcher
  diff (expected vs received). For `.rejects` / `.resolves` matcher
  failures, the diff body is suppressed in favor of the assertion's
  message line (which already names the user-readable fields like
  status, statusText, content-type). Symbol-keyed Node.js internal-state
  graphs are stripped from received-value dumps. A `(truncated: ...)`
  marker shows when sanitization fired.
- `crux --json` for machine-readable output. Locked schema at
  `cruxVersion: 1`; field additions are additive across v0.1 to v1.x.
- `crux --full` disables the smart truncation pass. Restores the
  verbatim expected/received payload. Equivalent: `CRUX_FULL=1`.
- `crux -- <command>` to forward a specific command verbatim, e.g.
  `crux -- npx vitest run path/to/test.ts`.
- Exit code matches the wrapped runner's exit code. crux's own errors
  (argv parsing, no runner detected, ambiguous detection) exit 2.

## When to use

- "run the tests" / "run my tests" -> `crux`
- "what tests are failing" -> `crux`
- After writing or modifying a test -> `crux` to verify
- Need parseable output for tool chaining -> `crux --json`

## When not to use

- The user explicitly asks for raw runner output -> use the runner directly.
- The user wants watch mode -> use the runner directly. crux is single-run.
- The user is debugging crux's own truncation behavior and needs the
  full payload -> add `--full` or set `CRUX_FULL=1`.

## For MCP-aware agents

The `crux-mcp` server exposes a single tool, `run_tests`, returning the
same JSON shape as `crux --json`. See `docs/mcp-hosts.md` for one-time
host registration.
