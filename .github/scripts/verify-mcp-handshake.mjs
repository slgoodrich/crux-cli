#!/usr/bin/env node
// Verify that dist/mcp/server.js handshakes correctly via MCP stdio.
// Run after `npm run build`. Exits 0 on success, non-zero on failure.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const serverPath = resolve(repoRoot, 'dist/mcp/server.js')

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: repoRoot,
  })

  const client = new Client({ name: 'crux-handshake-check', version: '1.0.0' })

  try {
    await client.connect(transport)

    const tools = await client.listTools()
    const runTestsTool = tools.tools.find((t) => t.name === 'run_tests')
    if (runTestsTool === undefined) {
      throw new Error(`run_tests tool missing from tools/list (got: ${tools.tools.map((t) => t.name).join(', ')})`)
    }
    if (typeof runTestsTool.description !== 'string' || runTestsTool.description.length === 0) {
      throw new Error('run_tests tool has no description')
    }

    const serverInfo = client.getServerVersion()
    if (serverInfo?.name !== 'crux-mcp') {
      throw new Error(`expected serverInfo.name "crux-mcp", got "${serverInfo?.name}"`)
    }

    process.stdout.write('ok: crux-mcp handshake verified\n')
    process.stdout.write(`  serverInfo.name: ${serverInfo.name}\n`)
    process.stdout.write(`  serverInfo.version: ${serverInfo.version}\n`)
    process.stdout.write(`  tools: ${tools.tools.map((t) => t.name).join(', ')}\n`)
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
