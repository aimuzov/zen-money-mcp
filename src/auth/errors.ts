/** Thrown when there is no usable token and the user must run `auth`. */
export class NotAuthenticatedError extends Error {
	constructor(message = 'Not authenticated. Run `zen-money-mcp auth` in your terminal once, then retry.') {
		super(message)
		this.name = 'NotAuthenticatedError'
	}
}
