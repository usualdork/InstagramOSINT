import test from 'ava';
import fc from 'fast-check';
import {withRateLimit} from '../../source/utils/rate-limiter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a rate limit error that will be detected by isRateLimitError.
 */
function createRateLimitError(message = 'throttled by Instagram'): Error {
	return new Error(message);
}

/**
 * Creates a function that fails K times with a rate limit error then succeeds.
 */
function createFailThenSucceed<T>(
	failCount: number,
	successValue: T,
): {fn: () => Promise<T>; callCount: () => number} {
	let calls = 0;
	const fn = async () => {
		calls++;
		if (calls <= failCount) {
			throw createRateLimitError();
		}

		return successValue;
	};

	return {fn, callCount: () => calls};
}

/**
 * Creates a function that always fails with a rate limit error.
 */
function createAlwaysFailing(): {
	fn: () => Promise<never>;
	callCount: () => number;
} {
	let calls = 0;
	const fn = async (): Promise<never> => {
		calls++;
		throw createRateLimitError();
	};

	return {fn, callCount: () => calls};
}

// ── Property 15: Rate Limiter Retry Success ───────────────────────────────────
// Feature: instagram-intelligence, Property 15: Rate Limiter Retry Success

test('Property 15: Rate Limiter Retry Success — fails K < maxRetries times then succeeds returns result', async t => {
	// **Validates: Requirements 18.4, 20.1**
	await fc.assert(
		fc.asyncProperty(
			// maxRetries between 2 and 6
			fc.integer({min: 2, max: 6}),
			// failCount must be less than maxRetries
			fc.integer({min: 1, max: 5}),
			// successValue can be any JSON-serializable value
			fc.oneof(fc.string(), fc.integer(), fc.boolean()),
			async (maxRetries, rawFailCount, successValue) => {
				const failCount = Math.min(rawFailCount, maxRetries - 1);
				const {fn} = createFailThenSucceed(failCount, successValue);

				const result = await withRateLimit(fn, {
					maxRetries,
					initialBackoff: 1,
					maxBackoff: 64,
				});

				t.is(result, successValue);
			},
		),
		{numRuns: 30},
	);
});

// ── Property 16: Rate Limiter Exponential Backoff ─────────────────────────────
// Feature: instagram-intelligence, Property 16: Rate Limiter Exponential Backoff

test('Property 16: Rate Limiter Exponential Backoff — delay before retry N equals min(initial * 2^N, max)', async t => {
	// **Validates: Requirements 20.2**
	await fc.assert(
		fc.asyncProperty(
			// maxRetries between 2 and 5
			fc.integer({min: 2, max: 5}),
			// initialBackoff in ms (small for fast tests)
			fc.integer({min: 10, max: 20}),
			// maxBackoff must be >= initialBackoff
			fc.integer({min: 50, max: 100}),
			async (maxRetries, initialBackoff, maxBackoff) => {
				const timestamps: number[] = [];

				const fn = async (): Promise<never> => {
					timestamps.push(Date.now());
					throw createRateLimitError();
				};

				try {
					await withRateLimit(fn, {
						maxRetries,
						initialBackoff,
						maxBackoff,
					});
				} catch {
					// Expected to throw after maxRetries
				}

				// We should have maxRetries + 1 timestamps (initial call + retries)
				// Actually: the code increments attempt after failure and checks attempt >= maxRetries
				// So we get maxRetries calls total (initial + maxRetries-1 retries? Let's verify)
				// Looking at the code: attempt starts at 0, increments after each failure,
				// throws when attempt >= maxRetries. So we get maxRetries+1 calls? No:
				// attempt++ happens after failure, then if attempt >= maxRetries, throw.
				// So: call 1 fails, attempt becomes 1; if 1 >= maxRetries stop. Otherwise backoff.
				// So total calls = maxRetries (since last call fails and attempt == maxRetries triggers throw)
				// Wait: first call fails, attempt=1, if 1>=maxRetries throw. Otherwise delay then next call.
				// second call fails, attempt=2, if 2>=maxRetries throw. Otherwise delay...
				// So total calls = maxRetries (the last one triggers the abort)
				t.is(timestamps.length, maxRetries);

				// Verify delays between consecutive calls match expected backoff
				for (let i = 1; i < timestamps.length; i++) {
					const elapsed = timestamps[i]! - timestamps[i - 1]!;
					// Backoff for retry i is: min(initialBackoff * 2^(i-1), maxBackoff)
					// The code uses: initialBackoff * 2 ** (attempt - 1) where attempt = i
					const expectedBackoff = Math.min(
						initialBackoff * 2 ** (i - 1),
						maxBackoff,
					);

					// Allow 30% tolerance for timer imprecision
					const lowerBound = expectedBackoff * 0.7;
					t.true(
						elapsed >= lowerBound,
						`Retry ${i}: elapsed ${elapsed}ms should be >= ${lowerBound}ms (expected ~${expectedBackoff}ms)`,
					);
				}
			},
		),
		{numRuns: 20},
	);
});

// ── Property 17: Rate Limiter Max Retries Abort ───────────────────────────────
// Feature: instagram-intelligence, Property 17: Rate Limiter Max Retries Abort

test('Property 17: Rate Limiter Max Retries Abort — always-failing fn throws after maxRetries attempts', async t => {
	// **Validates: Requirements 20.5**
	await fc.assert(
		fc.asyncProperty(
			// maxRetries between 1 and 6
			fc.integer({min: 1, max: 6}),
			async maxRetries => {
				const {fn, callCount} = createAlwaysFailing();

				const error = await t.throwsAsync(
					() =>
						withRateLimit(fn, {
							maxRetries,
							initialBackoff: 1,
							maxBackoff: 16,
						}),
					{instanceOf: Error},
				);

				// Verify the error message mentions retries
				t.true(
					error!.message.includes(`${maxRetries} retries`),
					`Error message should mention ${maxRetries} retries, got: "${error!.message}"`,
				);

				// The function should have been called exactly maxRetries times
				t.is(
					callCount(),
					maxRetries,
					`Expected ${maxRetries} calls, got ${callCount()}`,
				);
			},
		),
		{numRuns: 30},
	);
});

// ── Property 18: Rate Limiter Inter-Request Delay ─────────────────────────────
// Feature: instagram-intelligence, Property 18: Rate Limiter Inter-Request Delay

test('Property 18: Rate Limiter Inter-Request Delay — elapsed time between calls >= configured delay', async t => {
	// **Validates: Requirements 20.4**
	await fc.assert(
		fc.asyncProperty(
			// delayBetween in ms (small for fast tests)
			fc.integer({min: 10, max: 30}),
			// Number of sequential calls to make
			fc.integer({min: 2, max: 4}),
			async (delayBetween, callCount) => {
				const timestamps: number[] = [];
				let callIndex = 0;

				// Make multiple successful calls with delayBetween configured
				for (let i = 0; i < callCount; i++) {
					callIndex++;
					const currentIndex = callIndex;
					// eslint-disable-next-line no-await-in-loop
					await withRateLimit(
						async () => {
							timestamps.push(Date.now());
							return currentIndex;
						},
						{
							maxRetries: 3,
							initialBackoff: 1,
							maxBackoff: 16,
							delayBetween,
						},
					);
				}

				t.is(timestamps.length, callCount);

				// Verify each call was preceded by at least delayBetween ms
				// The delayBetween is applied BEFORE each call (including the first),
				// so we check gaps between consecutive call timestamps
				for (let i = 1; i < timestamps.length; i++) {
					const elapsed = timestamps[i]! - timestamps[i - 1]!;
					// Allow slight tolerance for timer imprecision (80% of expected)
					const lowerBound = delayBetween * 0.8;
					t.true(
						elapsed >= lowerBound,
						`Gap between call ${i - 1} and ${i}: ${elapsed}ms should be >= ${lowerBound}ms (delayBetween: ${delayBetween}ms)`,
					);
				}
			},
		),
		{numRuns: 20},
	);
});
