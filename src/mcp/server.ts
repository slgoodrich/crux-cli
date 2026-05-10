#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { writeFatalError } from '../error-output.js'
import { assertNodeVersion } from '../errors.js'
import { runTestsHandler, runTestsTool } from './tools.js'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8')) as {
  version: string
}

main()

async function main(): Promise<void> {
  try {
    assertNodeVersion()

    const server = new McpServer({ name: 'crux-mcp', version: pkg.version })
    // Forward args directly. Destructuring (`{ command, cwd }`) would
    // silently drop any input field added later (e.g., the `full`
    // toggle), so pass the full parsed args through.
    server.registerTool(runTestsTool.name, runTestsTool.config, async (args) =>
      runTestsHandler(args),
    )

    const transport = new StdioServerTransport()
    await server.connect(transport)
    // Process stays alive until stdin closes; the SDK closes the server,
    // the event loop drains, the process exits 0.
  } catch (err) {
    writeFatalError('crux-mcp', err)
  }
}
