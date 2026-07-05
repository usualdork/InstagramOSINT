import type {RateLimiterOptions} from '../types/intelligence.js';

/**
 * Checks whether an error indicates an Instagram rate limit response.
 * Detects HTTP 429 status codes, "throttled" or "rate limit" messages,
 * and Instagram-specific rate limit errors.
 */
export function isRateLimitError(error: unknown): boolean {
	if (error === null || error === undefined) {
		return false;
	}

	// Check for status code 429
	if (typeof error === 'object') {
		const err = error as Record<string, unknown>;

		if (err['statusCode'] === 429 || err['status'] === 429) {
			return true;
		}

		// Check nested response object (instagram-private-api pattern)
		if (typeof err['response'] === 'object' && err['response'] !== null) {
			const response = err['response'] as Record<string, unknown>;
			if (response['statusCode'] === 429 || response['status'] === 429) {
				return true;
			}
		}
	}

	// Check error message for throttle/rate limit indicators
	const message =
		error instanceof Error
			? error.message
			: typeof error === 'object'
				? String((error as Record<string, unknown>)['message'] ?? '')
				: String(error);

	const lowerMessage = message.toLowerCase();
	if (
		lowerMessage.includes('throttled') ||
		lowerMessage.includes('rate limit') ||
		lowerMessage.includes('rate_limit') ||
		lowerMessage.includes('please wait')
	) {
		return true;
	}

	// Check error name for Instagram-specific errors
	if (error instanceof Error) {
		const lowerName = error.name.toLowerCase();
		if (
			lowerName.includes('igresponse') ||
			lowerName.includes('igrequestserror')
		) {
			if (lowerMessage.includes('throttl') || lowerMessage.includes('wait')) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Delays execution for the specified number of milliseconds.
 */
async function delay(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

/**
 * Wraps an async function with rate limit retry logic and optional inter-request delays.
 *
 * - Retries on rate-limit errors with exponential backoff (1s initial, 60s max, 5 max retries)
 * - Supports a fixed delay between requests via `delayBetween`
 * - Displays wait duration messages to stderr while retrying
 */
export async function withRateLimit<T>(
	fn: () => Promise<T>,
	options?: RateLimiterOptions,
): Promise<T> {
	const maxRetries = options?.maxRetries ?? 5;
	const initialBackoff = options?.initialBackoff ?? 1000;
	const maxBackoff = options?.maxBackoff ?? 60_000;
	const delayBetween = options?.delayBetween;

	let attempt = 0;

	while (true) {
		// Apply fixed inter-request delay before each call if configured
		if (delayBetween !== undefined && delayBetween > 0) {
			await delay(delayBetween);
		}

		try {
			const result = await fn();
			return result;
		} catch (error: unknown) {
			if (!isRateLimitError(error)) {
				throw error;
			}

			attempt++;

			if (attempt >= maxRetries) {
				throw new Error(
					`Rate limit exceeded after ${attempt} retries. Please try again later.`,
				);
			}

			const backoff = Math.min(initialBackoff * 2 ** (attempt - 1), maxBackoff);
			const seconds = Math.round(backoff / 1000);

			process.stderr.write(`Rate limited. Retrying in ${seconds}s...\n`);

			await delay(backoff);
		}
	}
}
