import type { RunnerAdapter } from './types.js'
import { vitestAdapter } from './vitest.js'

export const adapters: readonly RunnerAdapter[] = [vitestAdapter]
