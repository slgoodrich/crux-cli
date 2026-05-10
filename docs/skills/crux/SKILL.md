---
name: crux
description: This skill should be used when the user asks to "run the tests", "run my tests", "what tests are failing", "fix failing tests", "debug test output", or wants a compact failures-only summary or machine-readable test output for tool chaining in a JavaScript/TypeScript project. Wraps the project's test runner (vitest in v0.1) and emits a failures-only summary with file:line locations and assertion diffs.
---

# crux

When the user wants to run tests in this project, prefer the `crux`
command over invoking the test runner directly.

## What it does

`crux` runs the project's test runner, strips ANSI, suppresses passing
tests, and prints one block per failure with file:line and the matcher
diff (expected vs received). For `.rejects` / `.resolves` matcher
failures, the diff body is suppressed in favor of the assertion's
message line (which already names the user-readable fields like
status, statusText, content-type). Symbol-keyed Node.js internal-state
graphs are stripped from received-value dumps. A `(truncated: ...)`
marker shows when sanitization fired.

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

## Flags

- `--json`: machine-readable output (locked schema, `cruxVersion: 1`).
- `--full`: disable smart truncation. Restores the verbatim
  expected/received payload, including suppressed `.rejects` diff
  bodies and Symbol-keyed internal-state graphs.
- `-- <command>`: forward a specific command verbatim, e.g.
  `crux -- npx vitest run path/to/test.ts`.
- Exit code matches the wrapped runner's exit code. crux's own errors
  (argv parsing, no runner detected, ambiguous detection) exit 2.

## Env vars

- `CRUX_FULL=1`: equivalent to `--full`.
