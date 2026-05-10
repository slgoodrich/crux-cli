# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-10

First public release. crux wraps a test runner, captures its output,
and emits a compact failures-only summary. Same pipeline available
as a CLI and as an MCP server companion.

### Added

- `crux` CLI: auto-detects vitest in JavaScript/TypeScript projects
  and emits a markdown failures-only summary by default. Flags:
  `--json`, `--raw`, `--cwd`, `--help`, `--version`.
- `crux-mcp` MCP server (stdio transport,
  `@modelcontextprotocol/sdk`). Exposes one tool, `run_tests`,
  returning the same JSON shape as `crux --json` plus a
  `structuredContent` field for clients that read it.
- Locked JSON output schema at `cruxVersion: 1`. Field additions are
  additive across v0.1 to v1.x. Removals and type changes are
  major-version-only.
- vitest adapter (default reporter): pass / fail / skip counts,
  per-failure file:line:column, matcher diff (expected vs received)
  when present, closest non-`node_modules` stack frame as `topFrame`.
  Compile-error, config-error, and binary-not-found classifications.
- Auto-detection from `package.json#devDependencies`,
  `vitest.config.*`, or `vitest.workspace.*`. Three-step tiebreaker
  for ambiguous cases. Wrapper-script resolution for `npm test`,
  `pnpm test`, `yarn test`, `npm run <script>`.
- Passthrough mode for unknown runners or unparseable output:
  forwards the child's stdout/stderr verbatim and prints a
  diagnostic notice to stderr.
- Documentation: README.md, AGENTS.md (host-neutral agent guidance),
  docs/mcp-hosts.md (per-host MCP setup), docs/using-claude-code.md
  (Claude Code skill setup), skills/crux.md (copy-paste skill file).

### Notes

- Node 20+ required.
- Two binaries (`crux`, `crux-mcp`), single package, single version.
- No telemetry. crux makes no network calls at runtime.
- No file-based config. Flags and environment variables only.
- Uses [shell-cassette](https://github.com/slgoodrich/shell-cassette)
  internally for cassetted subprocess testing. Recommended for
  crux-using agents that need replayable test invocations.

[0.1.0]: https://github.com/slgoodrich/crux-cli/releases/tag/v0.1.0
