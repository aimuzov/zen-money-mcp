import type { Config } from '#zen/config'
import type { Db } from '#zen/store/db'

/** Shared dependencies passed to every tool's register function. */
export type ToolContext = {
	db: Db
	cfg: Config
}
