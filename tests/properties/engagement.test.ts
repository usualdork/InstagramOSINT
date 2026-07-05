import test from 'ava';
import fc from 'fast-check';

// ── Pure Function Under Test ──────────────────────────────────────────────────

/**
 * Computes the engagement rate from a list of posts and a follower count.
 * Extracted from source/commands/engagement.tsx for property testing.
 */
function computeEngagementRate(
	posts: Array<{likeCount: number; commentCount: number}>,
	followerCount: number,
): number {
	const totalLikes = posts.reduce((sum, p) => sum + p.likeCount, 0);
	const totalComments = posts.reduce((sum, p) => sum + p.commentCount, 0);
	const avgLikes = totalLikes / posts.length;
	const avgComments = totalComments / posts.length;
	return ((avgLikes + avgComments) / followerCount) * 100;
}

// ── Generators ────────────────────────────────────────────────────────────────

/**
 * Generates a post with non-negative integer like and comment counts.
 */
const postArb = fc.record({
	likeCount: fc.integer({min: 0, max: 100_000}),
	commentCount: fc.integer({min: 0, max: 50_000}),
});

/**
 * Generates a non-empty array of posts.
 */
const postsArb = fc.array(postArb, {minLength: 1, maxLength: 50});

/**
 * Generates a positive follower count (must be > 0 to avoid division by zero).
 */
const followerCountArb = fc.integer({min: 1, max: 10_000_000});

// ── Property 19: Engagement Rate Formula ──────────────────────────────────────
// Feature: instagram-intelligence, Property 19: Engagement Rate Formula

test('Property 19: Engagement Rate Formula — computed rate equals ((avgLikes + avgComments) / followerCount) * 100', t => {
	// **Validates: Requirements 9.1, 9.2**
	fc.assert(
		fc.property(postsArb, followerCountArb, (posts, followerCount) => {
			const result = computeEngagementRate(posts, followerCount);

			// Compute expected value using the direct formula
			const totalLikes = posts.reduce((sum, p) => sum + p.likeCount, 0);
			const totalComments = posts.reduce((sum, p) => sum + p.commentCount, 0);
			const n = posts.length;
			const expected =
				((totalLikes / n + totalComments / n) / followerCount) * 100;

			// Use approximate equality to handle floating point precision
			const diff = Math.abs(result - expected);
			return diff < 1e-10;
		}),
		{numRuns: 100},
	);

	t.pass();
});
