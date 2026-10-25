const SNIPPET_LENGTH = 200

/** Начало тела ответа для текста ошибки: HTML-страницу целиком не тащим. */
export function bodySnippet(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim()

	return flat.length > SNIPPET_LENGTH ? `${flat.slice(0, SNIPPET_LENGTH)}...` : flat
}

export function parseJsonObject(text: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = JSON.parse(text)

		return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
	} catch {
		return undefined
	}
}
