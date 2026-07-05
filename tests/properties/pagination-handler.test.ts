import test from 'ava';
import fc from 'fast-check';
import {paginate} from '../../source/utils/pagination-handler.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a mock fetchPage function that splits a list of items into pages
 * of a given size, using string cursors to navigate between pages.
 */
function createMockFetchPage<T>(allItems: T[], pageSize: number) {
	return async (
		cursor?: string,
	): Promise<{items: T[]; nextCursor?: string}> => {
		const startIndex = cursor === undefined ? 0 : Number.parseInt(cursor, 10);
		const endIndex = Math.min(startIndex + pageSize, allItems.length);
		const items = allItems.slice(startIndex, endIndex);
		const nextCursor =
			endIndex < allItems.length ? String(endIndex) : undefined;
		return {items, nextCursor};
	};
}

// ── Generators ────────────────────────────────────────────────────────────────

/**
 * Generates a total item count (1-100) and a page size (1-20).
 */
const paginationParamsArb = fc.record({
	totalItems: fc.integer({min: 1, max: 100}),
	pageSize: fc.integer({min: 1, max: 20}),
});

// ── Property 11: Pagination Completeness ──────────────────────────────────────
// Feature: instagram-intelligence, Property 11: Pagination Completeness

test('Property 11: Pagination Completeness — with all: true, returns exactly N items from mock paginated source', t => {
	// **Validates: Requirements 4.3, 5.3, 7.3, 11.3, 18.1, 18.2**
	return fc.assert(
		fc.asyncProperty(paginationParamsArb, async ({totalItems, pageSize}) => {
			// Generate N items
			const allItems = Array.from({length: totalItems}, (_, i) => ({
				id: i,
				value: `item-${i}`,
			}));

			const fetchPage = createMockFetchPage(allItems, pageSize);

			const result = await paginate(fetchPage, {
				all: true,
				pageSize,
				onProgress() {
					// No-op to suppress stderr output
				},
			});

			// Result must contain exactly N items
			t.is(
				result.length,
				totalItems,
				`Expected ${totalItems} items but got ${result.length}`,
			);

			// Items must match the original data in order
			for (let i = 0; i < totalItems; i++) {
				t.deepEqual(
					result[i],
					allItems[i],
					`Item at index ${i} does not match expected`,
				);
			}
		}),
		{numRuns: 100},
	);
});

// ── Property 12: Pagination Page Size ─────────────────────────────────────────
// Feature: instagram-intelligence, Property 12: Pagination Page Size

test('Property 12: Pagination Page Size — fetch is called the correct number of times based on page size', t => {
	// **Validates: Requirements 18.2**
	return fc.assert(
		fc.asyncProperty(paginationParamsArb, async ({totalItems, pageSize}) => {
			// Generate items
			const allItems = Array.from({length: totalItems}, (_, i) => ({id: i}));

			// Track how many times fetchPage is called
			let callCount = 0;
			const fetchPage = async (
				cursor?: string,
			): Promise<{items: {id: number}[]; nextCursor?: string}> => {
				callCount++;
				const startIndex =
					cursor === undefined ? 0 : Number.parseInt(cursor, 10);
				const endIndex = Math.min(startIndex + pageSize, allItems.length);
				const items = allItems.slice(startIndex, endIndex);
				const nextCursor =
					endIndex < allItems.length ? String(endIndex) : undefined;
				return {items, nextCursor};
			};

			await paginate(fetchPage, {
				all: true,
				pageSize,
				onProgress() {
					// No-op to suppress stderr output
				},
			});

			// The number of pages should equal ceil(totalItems / pageSize)
			const expectedCalls = Math.ceil(totalItems / pageSize);
			t.is(
				callCount,
				expectedCalls,
				`Expected ${expectedCalls} fetch calls (${totalItems} items / ${pageSize} page size) but got ${callCount}`,
			);
		}),
		{numRuns: 100},
	);
});
