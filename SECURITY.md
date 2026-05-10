# Security Policy

## Supported versions

The latest minor release on the `0.x` line gets security fixes. Older
minors do not.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | Yes                |
| < 0.1   | No (pre-release)   |

## Reporting a vulnerability

Use GitHub's private vulnerability reporting:

1. Go to [Security > Report a vulnerability](https://github.com/slgoodrich/crux-cli/security/advisories/new).
2. Describe the issue, affected versions, and reproduction steps.

Reports are triaged within 7 days. Fixes for confirmed issues land in
a patch release on the supported minor.

If GitHub's private reporting is unavailable, email
`hello@stevelgoodrich.com` with the same details. Please do not
disclose details publicly until a patch is released.

## Scope

In scope:

- The `crux-cli` package (both `crux` and `crux-mcp` binaries).
- This repository's GitHub Actions workflows.

Out of scope:

- Vulnerabilities in upstream test runners (vitest, jest, pytest,
  cargo test, go test). Report those upstream.
- Vulnerabilities in `@modelcontextprotocol/sdk`, `execa`, or other
  direct dependencies. Report those upstream.
- Issues that require local code execution as a precondition (crux
  runs subprocesses against the user's project; that is the design).

## What crux does at runtime

- crux makes no network calls. No telemetry, no update checks, no
  remote logging.
- crux reads no `.env*` files and surfaces no environment variables
  except those it forwards to the wrapped runner.
- crux writes nothing outside its child process's working directory
  unless the user passes `--cwd`.

If you find a behavior that contradicts any of the above, that is a
security issue and qualifies for private reporting.
