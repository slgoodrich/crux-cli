import { z } from 'zod'

import type { Config } from '../config.js'
import { CruxError } from '../errors.js'
import { buildJsonEnvelope, type CruxJsonEnvelope, serializeEnvelope } from '../format/json.js'
import { runTests } from '../pipeline.js'

const RUN_TESTS_DESCRIPTION = `Run the project's test suite and return a structured failures-only summary.
Auto-detects the runner (vitest in v0.1) from the working directory, or runs an explicit command.
By default, applies smart truncation to large expected/received payloads (e.g., Node.js
internal-state graphs from rejects-style assertions). Pass full: true to disable truncation.
Returns the same JSON shape as \`crux --json\` (cruxVersion: 1).`

const RunTestsInputObject = z.object({
  command: z
    .array(z.string())
    .optional()
    .describe(
      'Optional explicit command, e.g. ["npx", "vitest", "run", "path/to/test.ts"]. If omitted, auto-detects the runner from cwd by scanning package.json deps and config files.',
    ),
  cwd: z
    .string()
    .optional()
    .describe(
      'Optional working directory, e.g. "/repos/my-project". Defaults to the server process cwd. Used for runner auto-detection and as the spawn cwd.',
    ),
  full: z
    .boolean()
    .optional()
    .describe(
      "If true, disable smart truncation of expected/received fields. Default false. Equivalent to crux --full. Set when the suppressed diff body or Symbol-keyed internal-state graphs are needed (debugging crux's sanitize pass, auditing the original payload).",
    ),
})

const RunTestsInputShape = RunTestsInputObject.shape

const StackFrameShape = z.object({
  filePath: z.string(),
  line: z.number(),
  column: z.number().nullable(),
})

const FailureShape = z.object({
  testName: z.string(),
  filePath: z.string().nullable(),
  line: z.number().nullable(),
  column: z.number().nullable(),
  message: z.string(),
  expected: z.string().nullable(),
  received: z.string().nullable(),
  topFrame: StackFrameShape.nullable(),
  expectedTruncated: z.literal(true).optional(),
  receivedTruncated: z.literal(true).optional(),
})

const RunnerErrorShape = z.object({
  kind: z.enum(['compile-error', 'config-error', 'binary-not-found', 'unknown']),
  message: z.string(),
})

const RunTestsOutputShape = {
  cruxVersion: z.literal(1),
  // v0.1: vitest only. Each milestone (v0.2 jest, v0.3 pytest, etc.) widens
  // this enum. The TypeScript RunnerId union covers all five future runners,
  // but the zod schema only declares those that ship in the current version.
  runner: z.enum(['vitest']),
  exitCode: z.number(),
  summary: z.object({
    passed: z.number(),
    failed: z.number(),
    skipped: z.number(),
    total: z.number(),
    durationMs: z.number().nullable(),
  }),
  failures: z.array(FailureShape),
  runnerError: RunnerErrorShape.nullable(),
}

export const runTestsTool = {
  name: 'run_tests',
  config: {
    description: RUN_TESTS_DESCRIPTION,
    inputSchema: RunTestsInputShape,
    outputSchema: RunTestsOutputShape,
    annotations: {
      title: 'Run tests',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
} as const

export type RunTestsInput = z.infer<typeof RunTestsInputObject>

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: CruxJsonEnvelope
  isError?: boolean
}

export async function runTestsHandler(input: RunTestsInput): Promise<ToolResult> {
  const config: Config = Object.freeze({
    format: 'json' as const,
    cwd: input.cwd ?? null,
    showHelp: false,
    showVersion: false,
    passthroughCommand: input.command ?? null,
    full: input.full === true,
  })

  try {
    const result = await runTests(config)

    if (result.kind === 'passthrough') {
      return errorResult(
        `crux: passthrough mode (${result.reason})`,
        "pass an explicit command via the 'command' input field",
      )
    }

    const envelope = buildJsonEnvelope(result.result, result.exitCode)
    const text = serializeEnvelope(envelope)
    return {
      content: [{ type: 'text', text }],
      structuredContent: envelope,
    }
  } catch (err) {
    if (err instanceof CruxError) {
      return errorResult(`crux: ${err.message}`, err.fix())
    }
    return errorResult(`crux: unexpected error: ${String(err)}`)
  }
}

function errorResult(message: string, fix?: string): ToolResult {
  const text = fix === undefined ? message : `${message}\nfix: ${fix}`
  return {
    content: [{ type: 'text', text }],
    isError: true,
  }
}
