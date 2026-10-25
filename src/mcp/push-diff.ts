import type { EndpointPreference } from '#zen/api/endpoints'
import { fetchDiff, type DiffInput } from '#zen/api/fetch-diff'
import { applyDiff } from '#zen/store/apply-diff'
import type { Db } from '#zen/store/db'

export type PushResult = {
	serverTimestamp: number
	/** ZenMoney diff принял, а локальный кэш не обновился. */
	warning?: string
}

/**
 * После успешного fetchDiff запись уже в ZenMoney. Ошибку локального кэша
 * не бросаем: модель приняла бы её за неудачную запись и повторила вызов.
 */
export async function pushDiff(
	db: Db,
	token: string,
	endpoint: EndpointPreference,
	input: DiffInput,
	fetchImpl?: typeof fetch,
): Promise<PushResult> {
	const diff = await fetchDiff(token, endpoint, input, fetchImpl)

	try {
		applyDiff(db, diff)
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err)

		return {
			serverTimestamp: diff.serverTimestamp,
			warning:
				`Saved to ZenMoney, but the local cache was not updated (${reason}). ` +
				'Do not repeat this call: run zen_sync to refresh the cache first.',
		}
	}

	return { serverTimestamp: diff.serverTimestamp }
}
