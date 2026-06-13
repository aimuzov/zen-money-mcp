import type { Db } from '../store/db.js'
import type { Config } from '../config.js'

/** Shared dependencies passed to every tool's register function. */
export interface ToolContext {
  db: Db
  cfg: Config
}
