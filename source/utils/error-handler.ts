import {createContextualLogger} from './logger.js';

export type ErrorType =
	| 'network'
	| 'auth_expired'
	| 'rate_limited'
	| 'user_not_found'
	| 'private_account'
	| 'comments_disabled'
	| 'unknown';

export interface ClassifiedError {
	type: ErrorType;
	message: string;
	suggestion?: string;
}

const logger = createContextualLogger('ErrorHandler');

/**
 * Classifies an unknown error into a known error type with a user-facing
 * message and optional suggestion. Logs the full error details via the
 * existing logger for diagnostics.
 */
export function classifyError(error: unknown): ClassifiedError {
	// Log full error details for debugging
	logger.error(
		'Error encountered',
		error instanceof Error ? error : new Error(String(error)),
	);

	// Extract useful properties from the error
	const message = getErrorMessage(error);
	const statusCode = getStatusCode(error);
	const errorName = getErrorName(error);

	// Network errors
	if (isNetworkError(message, errorName)) {
		return {
			type: 'network',
			message: 'Network error: unable to reach Instagram',
			suggestion: 'Check your internet connection',
		};
	}

	// Auth expired
	if (isAuthExpiredError(message, statusCode, errorName)) {
		return {
			type: 'auth_expired',
			message: 'Session expired',
			suggestion: 'Run `auth refresh` or `auth login`',
		};
	}

	// Rate limited
	if (isRateLimitedError(message, statusCode, errorName)) {
		return {
			type: 'rate_limited',
			message: 'Rate limited by Instagram',
			suggestion: undefined,
		};
	}

	// User not found
	if (isUserNotFoundError(message, statusCode, errorName)) {
		const username = extractUsername(message);
		return {
			type: 'user_not_found',
			message: username ? `User '${username}' not found` : 'User not found',
			suggestion: undefined,
		};
	}

	// Private account
	if (isPrivateAccountError(message, errorName)) {
		const username = extractUsername(message);
		return {
			type: 'private_account',
			message: username
				? `Account '@${username}' is private`
				: 'Account is private',
			suggestion: 'You must follow this account to view their data',
		};
	}

	// Comments disabled
	if (isCommentsDisabledError(message, errorName)) {
		return {
			type: 'comments_disabled',
			message: 'Comments are disabled on this post',
			suggestion: undefined,
		};
	}

	// Unknown
	return {
		type: 'unknown',
		message: 'An unexpected error occurred',
		suggestion: 'See log file for details',
	};
}

/**
 * Formats a classified error for user output.
 * In JSON mode, returns a JSON string with `{ok: false, error: message}`.
 * In text mode, returns the error message optionally followed by a suggestion line.
 */
export function formatErrorOutput(
	classified: ClassifiedError,
	isJson: boolean,
): string {
	if (isJson) {
		return JSON.stringify(jsonError(classified.message));
	}

	let output = `Error: ${classified.message}`;
	if (classified.suggestion) {
		output += `\nSuggestion: ${classified.suggestion}`;
	}

	return output;
}

/**
 * Returns the standard JSON error envelope.
 */
export function jsonError(message: string): {ok: false; error: string} {
	return {ok: false, error: message};
}

// --- Internal helpers ---

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'object' && error !== null) {
		const err = error as Record<string, unknown>;
		if (typeof err['message'] === 'string') {
			return err['message'];
		}
	}

	return String(error ?? '');
}

function getStatusCode(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null) {
		return undefined;
	}

	const err = error as Record<string, unknown>;

	if (typeof err['statusCode'] === 'number') {
		return err['statusCode'];
	}

	if (typeof err['status'] === 'number') {
		return err['status'];
	}

	// Check nested response (instagram-private-api pattern)
	if (typeof err['response'] === 'object' && err['response'] !== null) {
		const response = err['response'] as Record<string, unknown>;
		if (typeof response['statusCode'] === 'number') {
			return response['statusCode'];
		}

		if (typeof response['status'] === 'number') {
			return response['status'];
		}
	}

	return undefined;
}

function getErrorName(error: unknown): string {
	if (error instanceof Error) {
		return error.name;
	}

	if (typeof error === 'object' && error !== null) {
		const err = error as Record<string, unknown>;
		if (typeof err['name'] === 'string') {
			return err['name'];
		}
	}

	return '';
}

function isNetworkError(message: string, name: string): boolean {
	const lower = message.toLowerCase();
	const lowerName = name.toLowerCase();

	return (
		lower.includes('econnrefused') ||
		lower.includes('enotfound') ||
		lower.includes('etimedout') ||
		lower.includes('econnreset') ||
		lower.includes('enetunreach') ||
		lowerName.includes('econnrefused') ||
		lowerName.includes('enotfound') ||
		lowerName.includes('etimedout')
	);
}

function isAuthExpiredError(
	message: string,
	statusCode: number | undefined,
	name: string,
): boolean {
	const lowerName = name.toLowerCase();
	const lowerMessage = message.toLowerCase();

	if (statusCode === 401) {
		return true;
	}

	if (
		lowerName.includes('igloginrequirederror') ||
		lowerName.includes('loginrequired')
	) {
		return true;
	}

	if (
		lowerMessage.includes('login_required') ||
		lowerMessage.includes('login required')
	) {
		return true;
	}

	return false;
}

function isRateLimitedError(
	message: string,
	statusCode: number | undefined,
	name: string,
): boolean {
	const lowerMessage = message.toLowerCase();
	const lowerName = name.toLowerCase();

	if (statusCode === 429) {
		return true;
	}

	if (
		lowerMessage.includes('throttled') ||
		lowerMessage.includes('rate limit') ||
		lowerMessage.includes('rate_limit') ||
		lowerMessage.includes('please wait')
	) {
		return true;
	}

	if (lowerName.includes('igresponse') && lowerMessage.includes('throttl')) {
		return true;
	}

	return false;
}

function isUserNotFoundError(
	message: string,
	statusCode: number | undefined,
	name: string,
): boolean {
	const lowerName = name.toLowerCase();
	const lowerMessage = message.toLowerCase();

	if (
		lowerName.includes('ignotfounderror') ||
		lowerName.includes('igexactusernotfounderror')
	) {
		return true;
	}

	if (statusCode === 404 && lowerMessage.includes('user')) {
		return true;
	}

	if (lowerMessage.includes('user not found')) {
		return true;
	}

	return false;
}

function isPrivateAccountError(message: string, name: string): boolean {
	const lowerName = name.toLowerCase();
	const lowerMessage = message.toLowerCase();

	if (lowerName.includes('igprivateusererror')) {
		return true;
	}

	if (
		lowerMessage.includes('private') &&
		(lowerMessage.includes('account') || lowerMessage.includes('user'))
	) {
		return true;
	}

	return false;
}

function isCommentsDisabledError(message: string, name: string): boolean {
	const lowerMessage = message.toLowerCase();
	const lowerName = name.toLowerCase();

	if (lowerName.includes('commentsdisabled')) {
		return true;
	}

	if (lowerMessage.includes('comments') && lowerMessage.includes('disabled')) {
		return true;
	}

	return false;
}

function extractUsername(message: string): string | undefined {
	// Try to extract username from common patterns like:
	// "User 'someuser' not found" or "Account '@someuser' is private"
	const patterns = [
		/'@?([a-zA-Z0-9_.]+)'/,
		/"@?([a-zA-Z0-9_.]+)"/,
		/@([a-zA-Z0-9_.]+)/,
		/user[:\s]+([a-zA-Z0-9_.]+)/i,
	];

	for (const pattern of patterns) {
		const match = pattern.exec(message);
		if (match?.[1]) {
			return match[1];
		}
	}

	return undefined;
}
