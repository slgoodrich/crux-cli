# Token reduction in test runner output: crux v0.1

## TL;DR

Across 7 real OSS projects (22 to 4,456 tests) and 3 controlled failure
fixtures, `crux` reduces test runner output by **78% to 99.9%** (median
~89%). The compression operates in three distinct modes:

- **All-pass runs** (no failures): raw vitest is already concise; crux
  collapses the per-file summary to one line. Reduction 83-91%.
- **Per-failure runs** (the typical case, a few real test failures):
  each failure block runs ~150-300 raw tokens of stack and matcher
  diff; crux compresses each to ~50 tokens. Reduction 87-98%. The
  upper end corresponds to `.rejects`/`.resolves` matcher failures,
  where vitest's default reporter dumps the full received value
  (often a `Response` or `Promise` whose internal graph runs to
  several KB of `Symbol(state)`, `ReadableStream`, and `HeadersList`
  Node.js internals); crux replaces that body with the assertion's
  message line, which already names the user-readable fields.
- **Cascade-failure runs** (build broken, dozens of suites fail to load):
  crux's runner-error parser detects the shape and emits a single
  diagnostic line. Reduction approaches 100%, with a tradeoff documented
  below.

Per-run absolute savings scale with project size and failure shape. On
a tiny utility, ~250 tokens. On Hono (4,456 tests, 4 failing, 2 of
which are `.rejects`-shape against `Response` objects), 27,551 tokens.
**On Vue's core (3,661 tests, 97 failing), 122,624 tokens, more raw
output than many cheap models can hold in a single message.** On Nuxt
with a broken build, 131,802 tokens collapsed to one line.

Compared to other reduction strategies an agent might reach for: `tail
-200` is silently incorrect (drops 2 of 4 failures on Hono with no
warning); `vitest --reporter=json` is **1.39M tokens** for the same
hono run (more than 2,100x crux); `--reporter=dot` is paradoxically
larger than `--reporter=default`. The hand-crafted
`vitest --reporter=json | jq | truncate` pipeline produces several
hundred to a few thousand tokens depending on cap, larger than crux's
662 for the same hono run, and requires seven prior-knowledge steps,
two test runs, and unix-only shell tools. Full comparison in the
"Alternatives compared" section below.

At Opus 4.7 input pricing ($5/MTok), the per-run cost saved is
**~$0.004 on a small project, ~$0.14 on Hono, ~$0.61 on Vue, ~$0.66
per Nuxt-class cascade event**. Sonnet 4.6 callers see roughly half
each row (lower per-token price plus ~25% fewer tokens for the same
content). Per-month figures depend on test-run cadence, which varies
wildly by project shape, team size, and CI strategy; the Cost impact
section below works through illustrative scenarios at honest cadences
rather than collapsing them into a single matrix. Anthropic's
prompt-cache TTL is five minutes, so most agent test workflows are
not cache-resident across runs and pay full input price each time.

## Problem statement

Test runner output is loud. Default `vitest run` against a 200-test
project prints file-level summaries, ANSI escapes, and on failures, full
stack traces stuffed with `node_modules` frames. Agents parsing that
output spend input tokens on noise: the runner's progress lines,
framework-internal stack frames, and per-file pass markers are not
actionable signal for "what failed and why."

The hono case grounds the problem concretely. Honojs is a 4,456-test
web framework whose vitest run produces 28,213 ANSI-stripped tokens
against today's HEAD. Of those, ~97% are runtime progress markers,
file-level pass listings, and (for the four failing tests) Node.js
internal-state graphs from `.rejects` matchers against `Response`
objects. Two of the four failures dump multi-KB
`Symbol(state)` / `ReadableStream` / `HeadersList` graphs that an
agent reading the output cannot use diagnostically. The other two
failures are short two-line `expected: false / received: true` diffs.

Naive reductions silently lose information. `tail -200` drops 2 of 4
hono failures because the relevant lines are further up than the
buffer; an agent reporting from tail's output would say "2 failures"
with full confidence and miss the others, with no warning that
anything was lost. `--reporter=json` is paradoxically worse: it emits
the full metadata for every passed and failed test, producing
1,391,977 tokens for the same hono run.

`crux` strips the output to one summary line plus, per failure,
file:line, the matcher diff (expected vs received), and the closest
non-`node_modules` stack frame. For `.rejects`/`.resolves` failures,
the diff body is suppressed in favor of the assertion's message line,
which already names the user-readable fields (response status,
statusText, content-type). Exit code passes through unchanged. Same
outcome, fewer tokens spent reading it.

## Design

crux is a five-stage pure-function pipeline:

```
argv → Config → resolve adapter → spawn subprocess → parse → sanitize → format → stdout
```

**Argument parsing.** `parseArgs(argv)` consumes argv plus a small set
of flags (`--json`, `--raw`, `--full`, `--cwd <dir>`, `-- <command>`)
and returns a frozen `Config`. The CLI overlays `CRUX_FULL=1` from env
onto `Config.full`. Unknown flags exit with `InvalidArgError`. Anything
after `--` is forwarded verbatim to the spawned subprocess.

**Adapter resolution.** `resolveCommand(config, projectFiles, adapters)`
picks the runner adapter. Without `--`, it auto-detects from
`package.json` deps, manifests, and config files; conflicts (e.g.,
vitest + jest both present) exit with `AdapterAmbiguousError`. With
`--`, it scans the first recognizable token of the explicit command
(e.g., `npx vitest`, `pnpm vitest`); unknown tokens fall through to
passthrough mode. v0.1 includes one adapter (vitest); v0.2 through
v0.5 add jest, pytest, cargo test, and go test against the same
contract.

**Subprocess spawn.** `spawn(command, { cwd })` runs the resolved
command via `execa` and returns `SubprocessCapture = { stdout, stderr,
exitCode }`. Exit code passes through verbatim; failed test runs
produce non-zero exit codes that flow upstream unchanged.

**Parse.** Each adapter exposes `parse(capture: SubprocessCapture):
RunResult` as a pure function. The vitest adapter strips ANSI, locates
the `Test Files` summary anchor, splits per-failure on the ` FAIL  `
prefix, and extracts file:line:column, matcher message, and the diff
block. Stack frames inside `node_modules`, vitest internals, and async
hooks are filtered; the closest user-code frame is recorded as
`topFrame`. Cascade failures (binary not found, config errors, compile
errors) are detected before the per-test parse and short-circuit to a
`runnerError` field.

**Sanitize.** `sanitizeRunResult(result, { full })` is a pure
post-process pass on the parsed result. It is a no-op when
`Config.full === true`, when the failures list is empty, or when
`runnerError` is set. Otherwise it walks the failures and applies three
rules per failure, in order:

1. **Promise-settlement collapse.** When a failure's `expected` field
   matches a `.rejects`/`.resolves` matcher placeholder
   (`[Error: rejected promise]`, `[Error: resolved promise]`, or
   vitest's multi-line `Error { "message": "rejected promise" }`
   variant), both `expected` and `received` are nulled and both
   `expectedTruncated` / `receivedTruncated` flags are set. The
   `AssertionError:` message line on the failure already carries the
   user-readable summary (e.g., `promise resolved "Response { status:
   200, statusText: 'OK', headers: { ... } }" instead of rejecting`),
   so the dumped diff body is redundant. The markdown formatter falls
   back to the message line; the JSON envelope flags the modification.

2. **Symbol-keyed line removal.** For non-rejects failures, sanitize
   walks each line of `expected` and `received`. Lines whose first
   non-whitespace token starts with `Symbol(` are dropped along with
   all subsequent lines at greater indent (the value block). This
   eliminates Node.js internal-state graphs (`Symbol(state)`,
   `Symbol(kType)`, `Symbol(kState)`, `Symbol(headers map)`) that have
   no diagnostic meaning to a reader investigating an assertion
   failure.

3. **Hard length cap.** Any field still longer than 2,048 characters
   is sliced to 2,048 and a `\n... [truncated]` marker is appended.

Each modification flips the corresponding optional
`Failure.expectedTruncated` / `Failure.receivedTruncated` flag in the
JSON envelope (omitted entirely when not modified, preserving
byte-identical output for unmodified failures). The original verbatim
payload is recoverable via `crux --full` or `CRUX_FULL=1`.

**Format.** The CLI emits one of three outputs:

- **Markdown** (default): one summary line plus, per failure, a header
  (`### FAIL <path>:<line> - <test name>`), the value lines or
  message-line fallback, an optional `(truncated: <fields>)` line when
  sanitize modified the diff, and a `at <topFrame>` location.
- **JSON** (`--json`): a `cruxVersion: 1` envelope. The schema is
  locked across v0.1 to v1.x; field additions are additive (e.g.,
  `expectedTruncated` / `receivedTruncated`), removals and type
  changes wait for v2.
- **Raw** (`--raw`): the unprocessed subprocess stdout/stderr, for
  debugging crux's own behavior.

The MCP server exposes the same pipeline as a single `run_tests` tool
with the same JSON envelope. The CLI form (`crux --json`) and the MCP
tool produce byte-equivalent output.

## Methodology

**Capture.** For each target, two files are recorded:

- Raw: `npx vitest run > raw.txt 2>&1` from inside the project.
- Crux: `node dist/cli.js --cwd <project> > crux.txt 2>&1` from this repo.

Both capture `stdout` plus `stderr`. The same vitest invocation runs in both
cases (crux does not alter the runner's command beyond default-reporter
selection), so any difference in token count comes from crux's parser and
formatter, not from a different test execution.

**ANSI handling.** Vitest emits ANSI escape codes for color and progress
even when stdout is redirected to a file. Most LLM tools (Anthropic SDK,
OpenAI SDK, Claude Code, Cursor) strip ANSI before passing output to the
model, so counting ANSI in the "raw" total would credit crux for
compression the agent never saw. The `token-bench` script strips ANSI
from both inputs before counting; crux output already contains no ANSI,
so the strip is a no-op on its side and a meaningful reduction on the
raw side.

**Tokenizer.** Anthropic's
[`/v1/messages/count_tokens`](https://platform.claude.com/docs/en/build-with-claude/token-counting)
endpoint against `claude-opus-4-7`. Each input is wrapped as a single
user message; the response's `input_tokens` is the figure used. Token
counting is free per Anthropic's docs and rate-limited to 100
requests per minute on the entry tier (well above the ~30 calls this
benchmark needs). Reduction *ratios* are stable across Anthropic
model choice (Sonnet 4.6 reproduces the same ratios within 1
percentage point on every target); absolute counts shift, with Sonnet
4.6 producing roughly 25% fewer tokens for the same content. See
Limitations for the cross-model comparison.

**Information retention.** For each failure in the targets above, crux's
output is checked against raw vitest for: (a) every failing test name
and path is preserved; (b) the matcher diff or message line is
preserved; (c) at least one user-code stack frame is preserved. The
hono `.rejects` failures explicitly drop the diff body in favor of the
message line; on those failures the message line contains the response
status, statusText, and content-type headers that the diff body
redundantly serialized. No other field is dropped silently, and the
JSON envelope flags every modification via `expectedTruncated` /
`receivedTruncated`.

**Reproducibility.** All seven projects clone from public
GitHub repositories. The three fixture scenarios live under
`tests/fixtures/projects/` in this repo. Every measurement is
reproducible end-to-end with the commands listed under "Reproduce"
below. Single-host caveats apply (see Limitations).

## Results

### Real projects

Selected to span the test-count range developers actually work with,
from a 22-test single-purpose utility to a framework monorepo.

| Project                                            | Tests | Failures | Raw tokens | Crux tokens | Reduction |
| -------------------------------------------------- | ----: | -------: | ---------: | ----------: | --------: |
| [unjs/destr](https://github.com/unjs/destr)        |    22 |        0 |        271 |          24 | **91.1%** |
| [tinylibs/tinybench](https://github.com/tinylibs/tinybench) | 195 | 0 |        139 |          24 | **82.7%** |
| [unjs/mlly](https://github.com/unjs/mlly)          |   200 |        1 |        991 |         128 | **87.1%** |
| [unjs/pathe](https://github.com/unjs/pathe)        |   387 |        0 |        194 |          24 | **87.6%** |
| [honojs/hono](https://github.com/honojs/hono)      | 4,456 |        4 |     28,213 |         662 | **97.7%** |
| [vuejs/core](https://github.com/vuejs/core)        | 3,661 |       97 |    134,301 |      11,677 | **91.3%** |
| [nuxt/nuxt](https://github.com/nuxt/nuxt) (cascade) | 921 ran (3,320 skipped) | 70 suite-load + 5 assert | 131,866 | 64 | **99.95%** |

The data spans three reduction modes:

**All-pass** (destr, tinybench, pathe). Raw vitest collapses to a summary
block when nothing failed; crux collapses it further to one line.
Reduction is high in percent terms but absolute savings are small
(~100-250 tokens). Reduction floor: ~83%.

**Per-failure** (mlly, hono, vue). Each failure block in raw output
runs ~150-300 tokens of stack frame and matcher diff (after ANSI
strip); crux compresses each to ~50 tokens (file:line, expected vs
received, closest non-`node_modules` frame). Per-run absolute savings
scale with failure count: mlly saves 863 tokens (1 failure), hono
saves 27,551 (4 failures), vue saves 122,624 (97 failures). Reduction
lands in the 87-98% range. Hono is the high anchor at 97.7% because
two of its four failures dump multi-KB internal-state graphs from
`.rejects` matchers against `Response` objects; crux's sanitize pass
replaces those bodies with the assertion's message line, which already
names the response status, statusText, and content-type headers, and
flags the modification via `expectedTruncated` / `receivedTruncated`
in the JSON envelope.

**Cascade failure** (nuxt). When the test runner can't load most suites
(build errors, missing build outputs, broken imports), raw vitest emits
long stack traces for every failed-to-load file. crux's parser detects
the runner-error shape and emits a single diagnostic line ("Runner error:
Failed Suites 67"). The agent receiving that line knows to fix the build
before re-running tests; the 132K tokens of stack-trace soup were
redundant. **Reduction reaches 99.9% in this mode, but with a tradeoff:
crux's single-line cascade summary drops the 5 actual assertion failures
that ran in the suites that did load.** This is by design (cascade
failures dominate the signal), but it is information loss, not pure
compression. Agents in cascade scenarios will fix the build first and
discover the underlying assertion failures on the next run.

### Controlled failure fixtures

| Scenario                                     | Tests | Failures   | Raw tokens | Crux tokens | Reduction |
| -------------------------------------------- | ----: | ---------- | ---------: | ----------: | --------: |
| `vitest-fail-single`                         |     3 | 1          |        524 |          83 | **84.2%** |
| `vitest-fail-many`                           |     6 | 4          |      1,399 |         308 | **78.0%** |
| `vitest-compile-error`                       |   n/a | (compile)  |        713 |          67 | **90.6%** |

The fixtures isolate failure shape from test count. `fail-single` shows
the per-failure overhead; `fail-many` shows how the reduction scales with
multiple matcher-diff blocks; `compile-error` shows that runner-level
errors (TypeScript/import failures before any test runs) are also cleaned
up rather than passed through verbatim.

The `fail-many` 78.0% number is the lowest reduction I measured.
Realistic failure-density scenarios land at or above it; all-pass
scenarios land above 82%; cascade scenarios approach 100% (with the
information-loss caveat).

### Wall-clock overhead

Running `crux` invokes the same `npx vitest run` command a developer
would run directly, then parses, sanitizes, and formats the output.
The added work is bounded by an internal performance budget (parse
< 50 ms, format < 5 ms) plus subprocess spawn cost.

| Project | Raw vitest (s) | crux (s) | Difference (s) |
| ------- | -------------: | -------: | -------------: |
| destr | 1.48 | 1.46 | -0.02 |
| tinybench | 7.65 | 7.71 | +0.06 |
| mlly | 1.36 | 1.38 | +0.02 |
| pathe | 1.53 | 1.52 | -0.01 |
| hono | 13.77 | 13.86 | +0.09 |
| vue | 66.98 | 66.49 | -0.49 |

Medians of three runs for the small projects, two for hono, one for
vue (where each run takes more than a minute). The overhead is below
run-to-run variance on every project; the dominant factor is
subprocess spawn (~50 to 100 ms regardless of test count), not parse
or format. Nuxt's cascade case is dominated by build setup and test
execution at multi-minute scale; the per-invocation overhead is
similarly negligible against that wall clock.

The takeaway is that crux compresses output without slowing the test
run. An agent reading crux's output is not paying a wall-clock cost
for the token reduction. The end-to-end agent-decision latency is
typically faster with crux because the agent reads ~10x fewer tokens
on the response side, but that figure depends on the agent's
deployment and is not measured here.

## Alternatives compared

A reasonable critique of the headline number is "raw `vitest run` is a
strawman, agents reduce test output before sending it to the model."
True. I measured every reduction strategy I could think of, against
Hono's failing run (4,456 tests, 4 failing). Same captured input, same
tokenizer, same ANSI handling.

The crux row was driven through the MCP tool, not the CLI, in a Claude
Code session in `/tmp/hono-bench` with `crux-mcp` registered locally.
The agent was Claude Opus 4.7 with extended thinking on xhigh. Two
prompts were used, in order:

1. **"run this project's tests"**, the natural ask. Claude reached
   for `bun run test | tail -200` (the agent's reflexive shortcut)
   instead of the registered MCP tool, and reported "2 failures"
   confidently. tail had silently dropped the other two.
2. **"Use the run_tests tool to run this project's tests and tell me
   what's failing."**, the explicit ask. Claude called `run_tests`
   via the MCP, returned the structured envelope counted in the table,
   and reported all four failures with file:line metadata.

The first prompt is the failure mode this paper is about: agents
default to ergonomic-feeling shortcuts that are silently wrong. **This
was Anthropic's most capable model on xhigh extended thinking, in a
directory with no AGENTS.md guiding it, and it still reached for
`tail` first.** The second prompt confirms crux works
correctly when directly invoked. The `AGENTS.md` and Claude Code
skill (`skills/crux/SKILL.md`) artifacts in v0.1 exist precisely to
bias the agent toward the
second behavior on the first prompt; pre-registration of those
artifacts is the recommended setup.

The CLI form (`crux --json --cwd /tmp/hono-bench`) produces byte-for-byte
equivalent output to the MCP tool (modulo trailing newline).

| Approach                                   | Tokens (Opus 4.7, ANSI-stripped) | All 4 failures preserved | Per-runner setup | Cross-platform |
| ------------------------------------------ | -------------------------------: | ------------------------ | ---------------- | -------------- |
| raw `vitest run`                           |                           28,213 | yes                      | none             | yes            |
| `vitest run \| tail -200`                   |                            3,309 | **no, silently dropped 2/4** | none        | yes            |
| `vitest run --reporter=dot`                |                           22,358 | yes                      | flag (vitest-only) | yes          |
| `vitest run --reporter=json`               |                        1,391,977 | yes                      | flag (vitest-only) | yes          |
| `vitest --reporter=json \| jq ... \| trunc` |                       ~700-3,000 | depends on cap            | flag + jq + 7 prior-knowledge steps | unix-only |
| **crux**                                   |                          **662** | **yes**                  | **none**         | **yes**        |

Three findings stand out:

**`tail` is silently incorrect.** The classic agent shortcut dropped
two of Hono's four failure blocks because the relevant lines were
further up than the buffer. An agent reporting from tail's output would
say "2 failures" with full confidence and miss the
`streamSSE > Should not be called onAbort if already closed` pair. No
warning, no signal that anything was lost. crux preserves all four.

**`--reporter=json` is paradoxically worse.** Vitest's JSON reporter
emits the full metadata for every passed and failed test (4,456 entries
for hono). The output is **1.39 million tokens**, more than 2,100x
crux's, ~50x raw default-reporter output, and far past most cheap-model
context windows. Useful for tooling that consumes JSON; catastrophic for
agent input. `--reporter=dot` is similarly counterintuitive: it dumps
each file's progress markers AND keeps the full failure blocks, ending
up *bigger* than `--reporter=default`.

**The "smart pipe" approach is now larger than crux.** An agent willing
to run
`vitest --reporter=json | jq '.testResults[].assertionResults[] | select(.status=="failed")' | truncate-strings`
can produce a few hundred to a few thousand tokens depending on cap.
crux is **662 tokens** for the same hono run, smaller than the jq
pipeline at its tightest realistic cap. Reaching the jq command also
requires:

1. Knowing `--reporter=json` exists (not in `vitest --help` short output).
2. Running the suite a second time. The JSON output isn't compatible
   with the default reporter's format.
3. Discovering that node deprecation warnings on stdout corrupt the
   JSON payload; routing stderr separately on the second attempt.
4. Inspecting the nested JSON shape (`.testResults[].assertionResults[]`,
   not obvious from `--help`).
5. Writing a `jq` filter that selects failed assertions.
6. Picking a character cap with no principled basis.
7. Accepting losses: line/column metadata, test ancestor hierarchy, and
   exit code as separate fields all live in stack-trace strings (or
   require their own jq invocation) and are typically dropped.
8. Accepting that `jq`, `tail`, and `sed` aren't installed by default on
   Windows. Without git-bash or WSL the entire pipeline doesn't run.

Even after all of that, the resulting output cuts mid-string at the
truncation cap (losing whatever bug-relevant content lives past byte N)
and lacks the structured `failures[].file/line/column/topFrame` fields
that crux's JSON envelope carries. The agent has to guess what got
dropped or re-run with a higher cap.

`crux` is **the smallest correct option that requires zero per-runner
setup**, and the smallest of the alternatives I measured for the hono
case. The tradeoff isn't "smaller than every conceivable alternative";
it's "smallest among options that (a) preserve all failures, (b) work
the same way on Windows / macOS / Linux, (c) need no flags or
post-processing tools the user has to know about, and (d) will produce
the same shape across vitest, jest, pytest, cargo test, and go test
as those adapters ship in v0.2 through v0.5." For agents that need
the original verbatim payload (debugging the truncation pass itself,
or auditing the suppressed diff bodies), `crux --full` and
`CRUX_FULL=1` bypass the sanitize pass.

## Cost impact

Per-run savings are directly measured. Translating to per-day or
per-month requires an assumption about test-run cadence, which varies
wildly by project shape, team size, and CI strategy: a small library
might run its full suite hundreds of times a day across PR CI plus
agent-driven local development; a framework-scale project (Vue, Nuxt)
typically batches runs aggressively (changed-file detection,
package-aware testing in monorepos, selective CI matrices) because a
full suite takes a minute or more. Slower test suites have lower run
cadences, which the per-run table below leaves to the reader to
multiply through.

Pricing as of 2026-05-10, Anthropic API standard rates, **Opus 4.7
input only** ($5/MTok). Sonnet 4.6 callers see roughly half each
row (lower per-token price plus ~25% fewer tokens for the same
content). Output token savings compound the input savings (less
context means shorter agent responses) but are omitted because they
depend on the agent's reasoning depth.

| Project size                | Tokens saved per run | Cost saved per run |
| --------------------------- | -------------------: | -----------------: |
| Small (mlly-class)          |                  863 |             $0.004 |
| Hono-class                  |               27,551 |             $0.138 |
| Vue-class                   |              122,624 |             $0.613 |
| Nuxt cascade event          |              131,802 |             $0.659 |

Three illustrative scenarios, with each cadence picked to be
defensible for its project size:

- **Agent debugging a single failing test through ~10 iterations on
  Hono.** ~$1.40 saved across the session. Trivial per session, but
  every agent-driven test cycle pays the full input cost in this
  range.
- **Solo developer running ~30 full-suite invocations during a focused
  TDD day on Hono.** ~$4 saved that day. About a coffee per day per
  developer; multiplied across an organization, the line item is
  visible.
- **A 10-developer team on Hono, 100-200 full-suite invocations per
  day across PR CI and local development.** Working-day cadence:
  100/day × 22 days × $0.138 ≈ **$304/month**; 200/day at the same
  cadence ≈ **$608/month**. Lower bound assumes calm engineering
  weeks; upper bound reflects active sprint cadence with frequent CI.

Vue-class projects multiply the per-run figure but typically have
much lower run cadence; framework cores rarely run full suites
hundreds of times per day. Plug in your own observed cadence rather
than scaling the table linearly.

Cascade-failure events (broken builds, ~132K tokens saved per run in
the Nuxt scenario) happen rarely and aren't included in any cadence
above; each one is bonus context that the team would otherwise have
eaten as agent input cost.

**Caching does not substitute for source-side reduction.** Anthropic's
prompt cache defaults to a 5-minute TTL; an optional 1-hour tier is
enabled via `cache_control: { ttl: "1h" }`. The TTL refreshes on each
cache hit at no additional cost, so tightly clustered calls stay
resident as long as the access pattern keeps refreshing them; the
failure mode is gaps between runs. CI on independent commits, nightly
suites, and any workflow with multi-minute idle gaps routinely fall
outside the 5-minute window; gaps longer than an hour (for example,
overnight runs and weekly regression sweeps) miss the 1-hour window
too. Iterative local debugging within a focused session is the case
that stays warm.

Cache misses are not free. Writes pay a premium of 1.25x base input
price for the 5-minute tier and 2x for the 1-hour tier; reads pay
0.1x when hits occur. Verbose runner output is therefore repaid in
full plus a write multiplier on every cold run. A second floor
applies: the minimum cacheable prefix is 1,024 to 4,096 tokens
depending on the model. [^cache-min-prefix] Payloads below the floor
process without caching, with no error, and
`cache_creation_input_tokens` and `cache_read_input_tokens` both
return 0. Small payloads bundled into a short system prompt can sit
under the floor and miss caching entirely without surfacing any
signal.

The cost-table figures above charge full input price per run, which
matches the workflow shape that actually pays the bill. Caching
reduces the cost of re-reading the same input within a warm window;
it does not reduce the cost of producing verbose output in the first
place, and it does not help in the gaps where most agent test
workflows live. Source-side reduction compresses the input that
caching would otherwise pay full input price (plus a write multiplier)
for; when caching does apply, the savings multiply further on warm
reads.

[^cache-min-prefix]: Per Anthropic's
    [prompt-caching documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
    as of 2026-05-10: 4,096 tokens for Claude Opus 4.5/4.6/4.7 and
    Haiku 4.5; 2,048 for Sonnet 4.6; 1,024 for Sonnet 4/4.5 and
    Opus 4/4.1.

## Limitations

**Single host, single platform.** All measurements are from one Windows
11 machine. Vue's 97 failures are likely Windows-specific (path
resolution, line endings); Nuxt's cascade is partially due to a build
state that varies by environment. Linux/macOS CI runs would produce
different absolute counts (probably fewer failures, smaller raw output,
smaller absolute savings) but similar reduction *ratios*. The
methodology is reproducible on other hosts; the numbers in this table
are not.

**Single model.** Headline token counts are specific to
`claude-opus-4-7`. Sonnet 4.6 produces about 25% fewer tokens for the
same content (range 15-31% across the 10 targets), and the reduction
*ratios* match within 1 percentage point on every target. Sonnet
sidebar (raw → crux, reduction; same input pairs):

| Project | Opus 4.7 | Sonnet 4.6 | Δ ratio |
| ------- | --------:| ----------:| -------:|
| destr | 271 → 24, 91.1% | 193 → 18, 90.7% | -0.4 pp |
| tinybench | 139 → 24, 82.7% | 110 → 18, 83.6% | +0.9 pp |
| mlly | 991 → 128, 87.1% | 771 → 93, 87.9% | +0.8 pp |
| pathe | 194 → 24, 87.6% | 148 → 18, 87.8% | +0.2 pp |
| hono | 28,213 → 662, 97.7% | 21,548 → 521, 97.6% | -0.1 pp |
| vue | 134,301 → 11,677, 91.3% | 106,008 → 8,621, 91.9% | +0.6 pp |
| nuxt | 131,866 → 64, 99.95% | 104,897 → 56, 99.95% | 0.0 pp |
| fail-single | 524 → 83, 84.2% | 434 → 65, 85.0% | +0.8 pp |
| fail-many | 1,399 → 308, 78.0% | 1,218 → 262, 78.5% | +0.5 pp |
| compile-error | 713 → 67, 90.6% | 568 → 59, 89.6% | -1.0 pp |

Haiku 4.5 numbers were not measured but track Opus more closely than
Sonnet by Anthropic's published tokenizer guidance. Callers projecting
costs for a different model should re-run the bench with the relevant
`model` argument to the count_tokens API.

**Single runner.** This document covers vitest only. v0.2 adds `jest`,
v0.3 adds `pytest`, v0.4 adds `cargo test`, v0.5 adds `go test`. Each
milestone repeats this benchmark. Reduction ratios are expected to be
in the same range, since each runner has the same "verbose progress
output, spurious framework frames" pattern that crux's parser collapses.

**Default reporter only.** All measurements use vitest's default reporter.
Projects using `--reporter=verbose`, `--reporter=tap`, or custom reporters
will see different absolute counts but similar ratios. crux's parser
falls back to passthrough mode when the reporter shape doesn't match
its parser, so user-customized reporters do not break the tool.

**Selection bias on benchmark targets.** Targets were chosen
for clean install via npm or pnpm and for genuine vitest usage. Two
projects (`unjs/h3`, `unjs/ohash`) failed to install on the bench
host and were excluded. h3 was excluded because it is a pnpm
workspace dependency that needs the parent workspace to resolve,
ohash because its vitest config required a build step I did not
perform. Their results would be measurable with deeper engagement;
the exclusion does not affect the ratios for the seven projects that
ran without errors.

**Cascade-mode information loss.** As noted in the Nuxt result, crux's
runner-error classification collapses cascade failures to a single
diagnostic line. This drops information about any individual test
failures that did execute. The behavior is correct for the cascade-mode
use case (fix the build first), but the 99.9% reduction comes partly
from compression and partly from this categorical drop. Per-failure
mode results (mlly, hono, vue) preserve every individual failure's
location, test name, and matcher message; the sanitize pass on
`.rejects`/`.resolves` failures suppresses only the redundant
internal-state diff body, recoverable via `crux --full`.

**Promise-settlement detection is heuristic.** The sanitize pass
identifies `.rejects`/`.resolves` failures by exact-match on vitest's
two emitted placeholder shapes (`[Error: rejected promise]` and the
multi-line `Error { "message": "rejected promise" }` variant). A
future vitest version could emit a third shape that the matcher would
miss; in that case the failure would fall through to the Symbol-line
strip and length-cap rules, still producing well-formed but slightly
larger output. Schema stability is not affected.

**No statistical rigor.** Ten data points across three modes is too
small for confidence intervals. Per-mode medians (Opus 4.7): all-pass
~88%, per-failure ~91%, fixtures ~84%. The headline range (78-99.9%)
is the literal min and max of the measurements.

## Conclusion and future work

crux compresses test runner output for agent consumption by 81 to
99.9% across realistic projects, preserving every failing test name,
location, and matcher message, and adding less wall-clock overhead
than the test suite's own run-to-run variance. v0.1 includes vitest
support; v0.2 through v0.5 add jest, pytest, cargo test, and go test
against the same adapter contract, with the same JSON envelope schema
(`cruxVersion: 1`, locked through v1.x). Reduction ratios are
expected to land in the same range for those runners, since each
emits the same "verbose progress, framework-internal frames,
redundant matcher diffs" pattern that crux's parser collapses.

The repository hosts the source, the issue tracker, and the
per-milestone benchmark documents. Contributions on additional
runners, reporter formats, or measurement methodology are welcome.

## Reproduce

For each project:

```bash
# clone, install, capture raw output, capture crux output, bench
git clone --depth 1 https://github.com/unjs/destr /tmp/destr-bench
cd /tmp/destr-bench && npm install
npx vitest run > /tmp/raw-destr.txt 2>&1
node <crux-repo>/dist/cli.js --cwd /tmp/destr-bench > /tmp/crux-destr.txt 2>&1
cd <crux-repo> && node --env-file=.env --import tsx scripts/anthropic-token-bench.ts /tmp/raw-destr.txt /tmp/crux-destr.txt
```

For pnpm-managed projects (e.g., `mlly`, `vuejs/core`):

```bash
git clone --depth 1 https://github.com/unjs/mlly /tmp/mlly-bench
cd /tmp/mlly-bench && npx -y pnpm@10 install --no-frozen-lockfile
# remaining steps identical to above
```

For the large-project anchors:

```bash
# Hono: ~30s clone, ~30s npm install, ~10s vitest run
git clone --depth 1 https://github.com/honojs/hono /tmp/hono-bench
cd /tmp/hono-bench && npm install --no-audit --no-fund
npx vitest run > /tmp/raw-hono.txt 2>&1
node <crux-repo>/dist/cli.js --cwd /tmp/hono-bench > /tmp/crux-hono.txt 2>&1

# Vue's core: ~1min clone, ~3-5min pnpm install, ~2-3min vitest run
git clone --depth 1 https://github.com/vuejs/core /tmp/vue-bench
cd /tmp/vue-bench && npx -y pnpm@10 install --no-frozen-lockfile
npx vitest run > /tmp/raw-vue.txt 2>&1
node <crux-repo>/dist/cli.js --cwd /tmp/vue-bench > /tmp/crux-vue.txt 2>&1

# Nuxt (cascade-failure case): ~1min clone, ~10min pnpm install,
# ~5min build, ~6min vitest run
git clone --depth 1 https://github.com/nuxt/nuxt /tmp/nuxt-bench
cd /tmp/nuxt-bench && npx -y pnpm@10 install --no-frozen-lockfile
npx -y pnpm@10 build              # builds workspace packages so vitest configs resolve
npx vitest run > /tmp/raw-nuxt.txt 2>&1
node <crux-repo>/dist/cli.js --cwd /tmp/nuxt-bench > /tmp/crux-nuxt.txt 2>&1
```

For the failure fixtures inside this repo:

```bash
cd <crux-repo>
npm run build
cd tests/fixtures/projects/vitest-fail-many
npm install --no-save
npx vitest run --reporter=default > /tmp/raw-fail-many.txt 2>&1
cd ../../../..
node dist/cli.js --cwd tests/fixtures/projects/vitest-fail-many > /tmp/crux-fail-many.txt 2>&1
node --env-file=.env --import tsx scripts/anthropic-token-bench.ts /tmp/raw-fail-many.txt /tmp/crux-fail-many.txt
```

## Methodology notes

- Run date: 2026-05-10. Node 23.11.0, vitest 4.1.5 (target projects on
  3.2.x and 4.1.x).
- Token counts via Anthropic's `/v1/messages/count_tokens` endpoint
  with `model: "claude-opus-4-7"`. Each input wrapped as a single user
  message. Requests pass `anthropic-version: 2023-06-01` and an
  `x-api-key` from `ANTHROPIC_API_KEY`. Sonnet 4.6 cross-checks were
  run against the same inputs with `model: "claude-sonnet-4-6"`.
- All targets fetched at `HEAD` of their main branches as of the run
  date. Re-running on a later commit may show small drift if the project
  added or removed tests.
- ANSI escape sequences stripped from both raw and crux outputs before
  tokenization, using the regex `/\x1b\[[0-9;?]*[a-zA-Z]/g` (covers SGR
  and most CSI sequences).
