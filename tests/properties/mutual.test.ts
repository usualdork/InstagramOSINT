import test from 'ava';
import fc from 'fast-check';

// ── Generators ────────────────────────────────────────────────────────────────

/**
 * Generates a UserListItem-like object with the given pk.
 */
const userListItemArb = (pk: string) =>
	fc.record({
		pk: fc.constant(pk),
		username: fc.string({minLength: 1, maxLength: 15}),
		fullName: fc.string({minLength: 0, maxLength: 30}),
		isVerified: fc.boolean(),
		isPrivate: fc.boolean(),
	});

/**
 * Generates an array of UserListItem-like objects with unique pk values.
 */
const uniqueUserListArb = fc
	.uniqueArray(fc.string({minLength: 1, maxLength: 10}), {
		minLength: 0,
		maxLength: 30,
	})
	.chain(pks => {
		if (pks.length === 0) {
			return fc.constant(
				[] as Array<{
					pk: string;
					username: string;
					fullName: string;
					isVerified: boolean;
					isPrivate: boolean;
				}>,
			);
		}

		return fc.tuple(...pks.map(pk => userListItemArb(pk)));
	});

/**
 * Mutual connections logic extracted from the command (same algorithm as mutual.tsx).
 * Computes the set intersection of two user lists by pk.
 */
function computeMutual<T extends {pk: string}>(
	following1: T[],
	following2: T[],
): T[] {
	const user2Pks = new Set(following2.map(u => u.pk));
	return following1.filter(u => user2Pks.has(u.pk));
}

// ── Property 20: Mutual Connections is Set Intersection ───────────────────────
// Feature: instagram-intelligence, Property 20: Mutual Connections is Set Intersection

test('Property 20: Mutual Connections is Set Intersection — result equals intersection of two user lists', t => {
	// **Validates: Requirements 6.1, 6.2**
	fc.assert(
		fc.property(uniqueUserListArb, uniqueUserListArb, (list1, list2) => {
			const mutual = computeMutual(list1, list2);

			const pks1 = new Set(list1.map(u => u.pk));
			const pks2 = new Set(list2.map(u => u.pk));

			// Every item in the mutual result has a pk that appears in both lists
			for (const item of mutual) {
				if (!pks1.has(item.pk)) {
					return false;
				}

				if (!pks2.has(item.pk)) {
					return false;
				}
			}

			// Every pk that appears in both lists has a corresponding item in the result
			const mutualPks = new Set(mutual.map(u => u.pk));
			for (const pk of pks1) {
				if (pks2.has(pk) && !mutualPks.has(pk)) {
					return false;
				}
			}

			// Result items are sourced from list1 (preserving list1's data)
			const list1Map = new Map(list1.map(u => [u.pk, u]));
			for (const item of mutual) {
				const original = list1Map.get(item.pk);
				if (original !== item) {
					return false;
				}
			}

			return true;
		}),
		{numRuns: 100},
	);

	t.pass();
});
