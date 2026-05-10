#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'

// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC byte is the literal we need to match
const ANSI_PATTERN = /\x1b\[[0-9;?]*[a-zA-Z]/g

function stripAnsi(s: string): string {
  return s.replace(ANSI_PATTERN, '')
}

async function countTokens(text: string, model: string, apiKey: string): Promise<number> {
  const response = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: text }],
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`count_tokens ${response.status}: ${body}`)
  }
  // biome-ignore lint/style/useNamingConvention: matches Anthropic's API response shape
  const data = (await response.json()) as { input_tokens: number }
  return data.input_tokens
}

const args = process.argv.slice(2)
if (args.length < 2 || args.length > 3) {
  process.stderr.write(
    'usage: tsx scripts/anthropic-token-bench.ts <raw-output-file> <crux-output-file> [model]\n' +
      'default model: claude-sonnet-4-6\n' +
      'requires ANTHROPIC_API_KEY in env\n',
  )
  process.exit(2)
}

// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation on NodeJS.ProcessEnv
const apiKey = process.env['ANTHROPIC_API_KEY']
if (apiKey === undefined || apiKey === '') {
  process.stderr.write('error: ANTHROPIC_API_KEY is not set in env\n')
  process.exit(2)
}

const [rawPath, cruxPath, modelArg] = args as [string, string, string | undefined]
const model = modelArg ?? 'claude-sonnet-4-6'

const raw = stripAnsi(readFileSync(rawPath, 'utf8'))
const crux = stripAnsi(readFileSync(cruxPath, 'utf8'))

const rawTokens = await countTokens(raw, model, apiKey)
const cruxTokens = await countTokens(crux, model, apiKey)
const reduction = ((rawTokens - cruxTokens) / rawTokens) * 100

process.stdout.write(
  `raw:   ${rawTokens} tokens (${model}, ANSI-stripped)\n` +
    `crux:  ${cruxTokens} tokens\n` +
    `delta: ${rawTokens - cruxTokens} tokens (${reduction.toFixed(1)}% reduction)\n`,
)
