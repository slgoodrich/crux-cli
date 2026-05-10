#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'

import { get_encoding } from 'tiktoken'

// Strip ANSI escape sequences before counting. Most LLM tools (Anthropic SDK,
// OpenAI SDK, Claude Code, Cursor) strip ANSI before passing terminal output
// to the model, so counting raw bytes that include ANSI overcredits crux for
// compression that the agent never actually saw. We compare model-visible
// content on both sides.
// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC byte is the literal we need to match
const ANSI_PATTERN = /\x1b\[[0-9;?]*[a-zA-Z]/g

function stripAnsi(s: string): string {
  return s.replace(ANSI_PATTERN, '')
}

const args = process.argv.slice(2)
if (args.length !== 2) {
  process.stderr.write('usage: tsx scripts/token-bench.ts <raw-output-file> <crux-output-file>\n')
  process.exit(2)
}

const [rawPath, cruxPath] = args as [string, string]
const raw = stripAnsi(readFileSync(rawPath, 'utf8'))
const crux = stripAnsi(readFileSync(cruxPath, 'utf8'))

// cl100k_base is the closest publicly-available proxy for Anthropic's
// tokenizer (gpt-4 era; ~5% drift in practice for English / structured text).
// Anthropic's exact tokenizer is not published; their token-counting API
// (https://platform.claude.com/docs/en/api/messages/count_tokens) gives
// model-accurate counts for callers who need them.
const enc = get_encoding('cl100k_base')
const rawTokens = enc.encode(raw).length
const cruxTokens = enc.encode(crux).length
enc.free()

const reduction = ((rawTokens - cruxTokens) / rawTokens) * 100

process.stdout.write(
  `raw:   ${rawTokens} tokens (cl100k_base, ANSI-stripped)\n` +
    `crux:  ${cruxTokens} tokens\n` +
    `delta: ${rawTokens - cruxTokens} tokens (${reduction.toFixed(1)}% reduction)\n`,
)
