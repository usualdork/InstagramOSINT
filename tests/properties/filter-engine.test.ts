import test from 'ava';
import fc from 'fast-check';
import {applyFilters} from '../../source/utils/filter-engine.js';

// ── Generators ────────────────────────────────────────────────────────────────

/**
 * Generates a simple record with a numeric "value" field and a string "name" field.
 */
const simpleRecordArb = fc.record({
	value: fc.integer({min: -1000, max: 1000}),
	name: fc.string({minLength: 1, maxLength: 20}),
});

/**
 * Generates an array of simple records.
 */
const simpleRecordsArb = fc.array(simpleRecordArb, {
	minLength: 0,
	maxLength: 50,
});

/**
 * Generates a valid ISO date string within a reasonable range.
 */
const isoDateArb = fc
	.integer({
		min: new Date('2020-01-01').getTime(),
		max: new Date('2025-12-31').getTime(),
	})
	.map(ts => new Date(ts).toISOString());

/**
 * Generates a record with a timestamp field (ISO date string).
 */
const timestampedRecordArb = fc.record({
	id: fc.string({minLength: 1, maxLength: 10}),
	createdAt: isoDateArb,
	value: fc.integer({min: 0, max: 100}),
});

/**
 * Generates an array of timestamped records.
 */
const timestampedRecordsArb = fc.array(timestampedRecordArb, {
	minLength: 0,
	maxLength: 50,
});

/**
 * Generates a record with text fields for text search testing.
 */
const textRecordArb = fc.record({
	id: fc.string({minLength: 1, maxLength: 10}),
	caption: fc.string({minLength: 0, maxLength: 50}),
	bio: fc.string({minLength: 0, maxLength: 50}),
});

/**
 * Generates an array of text records.
 */
const textRecordsArb = fc.array(textRecordArb, {minLength: 0, maxLength: 50});

/**
 * Generates a record with boolean attributes for boolean filter testing.
 */
const userRecordArb = fc.record({
	username: fc.string({minLength: 1, maxLength: 15}),
	isVerified: fc.boolean(),
	isPrivate: fc.boolean(),
});

/**
 * Generates an array of user records.
 */
const userRecordsArb = fc.array(userRecordArb, {minLength: 0, maxLength: 50});

// ── Property 5: Filter Limit Constraint ───────────────────────────────────────
// Feature: instagram-intelligence, Property 5: Filter Limit Constraint

test('Property 5: Filter Limit Constraint — output length <= N, items are prefix of input', t => {
	// **Validates: Requirements 4.2, 5.2, 7.2, 9.3, 11.2, 13.2, 14.2, 15.2, 17.1**
	fc.assert(
		fc.property(
			simpleRecordsArb,
			fc.integer({min: 1, max: 100}),
			(items, limit) => {
				const result = applyFilters(items, {limit});

				// Output length must be at most limit
				t.true(
					result.length <= limit,
					`Result length ${result.length} should be <= limit ${limit}`,
				);

				// Output length should be min(items.length, limit)
				t.is(
					result.length,
					Math.min(items.length, limit),
					`Result length should be min(${items.length}, ${limit})`,
				);

				// Items should be a prefix of the input array
				for (let i = 0; i < result.length; i++) {
					t.deepEqual(result[i], items[i]);
				}
			},
		),
		{numRuns: 100},
	);
});

// ── Property 6: Filter Offset Skips Items ─────────────────────────────────────
// Feature: instagram-intelligence, Property 6: Filter Offset Skips Items

test('Property 6: Filter Offset Skips Items — output equivalent to dropping first N items', t => {
	// **Validates: Requirements 17.2**
	fc.assert(
		fc.property(
			simpleRecordsArb,
			fc.integer({min: 0, max: 100}),
			(items, offset) => {
				const result = applyFilters(items, {offset});

				// Result should be equivalent to slicing the input
				const expected = items.slice(offset);
				t.is(
					result.length,
					expected.length,
					`Result length ${result.length} should equal expected ${expected.length} (offset: ${offset}, items: ${items.length})`,
				);

				t.deepEqual(result, expected);
			},
		),
		{numRuns: 100},
	);
});

// ── Property 7: Filter Sort Ordering ──────────────────────────────────────────
// Feature: instagram-intelligence, Property 7: Filter Sort Ordering

test('Property 7: Filter Sort Ordering — consecutive pairs ordered by field (ascending)', t => {
	// **Validates: Requirements 17.3, 17.4**
	fc.assert(
		fc.property(simpleRecordsArb, items => {
			const result = applyFilters(items, {sort: 'value'});

			// Verify ascending order for consecutive pairs
			for (let i = 1; i < result.length; i++) {
				const prev = result[i - 1]!['value'] as number;
				const curr = result[i]!['value'] as number;
				t.true(
					prev <= curr,
					`Items not in ascending order: ${prev} > ${curr} at index ${i}`,
				);
			}
		}),
		{numRuns: 100},
	);
});

test('Property 7: Filter Sort Ordering — consecutive pairs ordered by field (descending)', t => {
	// **Validates: Requirements 17.3, 17.4**
	fc.assert(
		fc.property(simpleRecordsArb, items => {
			const result = applyFilters(items, {sort: 'value', desc: true});

			// Verify descending order for consecutive pairs
			for (let i = 1; i < result.length; i++) {
				const prev = result[i - 1]!['value'] as number;
				const curr = result[i]!['value'] as number;
				t.true(
					prev >= curr,
					`Items not in descending order: ${prev} < ${curr} at index ${i}`,
				);
			}
		}),
		{numRuns: 100},
	);
});

// ── Property 8: Filter Date Range ────────────────────────────────────────────
// Feature: instagram-intelligence, Property 8: Filter Date Range

test('Property 8: Filter Date Range — all items have timestamps within specified bounds (since)', t => {
	// **Validates: Requirements 7.4, 7.5, 17.5, 17.6**
	fc.assert(
		fc.property(
			timestampedRecordsArb,
			fc.integer({
				min: new Date('2020-01-01').getTime(),
				max: new Date('2025-12-31').getTime(),
			}),
			(items, sinceTs) => {
				const sinceDate = new Date(sinceTs);
				const since = sinceDate.toISOString();
				const result = applyFilters(items, {since}, 'createdAt');

				// All items in result must have timestamp strictly after since
				for (const item of result) {
					const itemDate = new Date(item['createdAt'] as string);
					t.true(
						itemDate > sinceDate,
						`Item date ${item['createdAt'] as string} should be after ${since}`,
					);
				}
			},
		),
		{numRuns: 100},
	);
});

test('Property 8: Filter Date Range — all items have timestamps within specified bounds (until)', t => {
	// **Validates: Requirements 7.4, 7.5, 17.5, 17.6**
	fc.assert(
		fc.property(
			timestampedRecordsArb,
			fc.integer({
				min: new Date('2020-01-01').getTime(),
				max: new Date('2025-12-31').getTime(),
			}),
			(items, untilTs) => {
				const untilDate = new Date(untilTs);
				const until = untilDate.toISOString();
				const result = applyFilters(items, {until}, 'createdAt');

				// All items in result must have timestamp strictly before until
				for (const item of result) {
					const itemDate = new Date(item['createdAt'] as string);
					t.true(
						itemDate < untilDate,
						`Item date ${item['createdAt'] as string} should be before ${until}`,
					);
				}
			},
		),
		{numRuns: 100},
	);
});

// ── Property 9: Filter Text Contains ─────────────────────────────────────────
// Feature: instagram-intelligence, Property 9: Filter Text Contains

test('Property 9: Filter Text Contains — all items contain search text in text fields', t => {
	// **Validates: Requirements 17.7**
	fc.assert(
		fc.property(
			textRecordsArb,
			fc.string({minLength: 1, maxLength: 5}),
			(items, searchText) => {
				const textFields = ['caption', 'bio'];
				const result = applyFilters(
					items,
					{contains: searchText},
					undefined,
					textFields,
				);

				const searchLower = searchText.toLowerCase();

				// All items in result must contain the search text in at least one text field
				for (const item of result) {
					const matchesAnyField = textFields.some(field => {
						const value = item[field];
						return (
							typeof value === 'string' &&
							value.toLowerCase().includes(searchLower)
						);
					});

					t.true(
						matchesAnyField,
						`Item should contain "${searchText}" in at least one of [${textFields.join(', ')}]`,
					);
				}
			},
		),
		{numRuns: 100},
	);
});

// ── Property 10: Filter Boolean Attributes ────────────────────────────────────
// Feature: instagram-intelligence, Property 10: Filter Boolean Attributes

test('Property 10: Filter Boolean Attributes — verified filter only includes verified items', t => {
	// **Validates: Requirements 13.3, 17.8, 17.9, 17.10**
	fc.assert(
		fc.property(userRecordsArb, items => {
			const result = applyFilters(items, {verified: true});

			// All items in result must have isVerified === true
			for (const item of result) {
				t.is(
					item['isVerified'],
					true,
					'All items should have isVerified === true when verified filter is applied',
				);
			}
		}),
		{numRuns: 100},
	);
});

test('Property 10: Filter Boolean Attributes — private filter only includes private items', t => {
	// **Validates: Requirements 13.3, 17.8, 17.9, 17.10**
	fc.assert(
		fc.property(userRecordsArb, items => {
			const result = applyFilters(items, {private: true});

			// All items in result must have isPrivate === true
			for (const item of result) {
				t.is(
					item['isPrivate'],
					true,
					'All items should have isPrivate === true when private filter is applied',
				);
			}
		}),
		{numRuns: 100},
	);
});

test('Property 10: Filter Boolean Attributes — public filter only includes non-private items', t => {
	// **Validates: Requirements 13.3, 17.8, 17.9, 17.10**
	fc.assert(
		fc.property(userRecordsArb, items => {
			const result = applyFilters(items, {public: true});

			// All items in result must have isPrivate === false
			for (const item of result) {
				t.is(
					item['isPrivate'],
					false,
					'All items should have isPrivate === false when public filter is applied',
				);
			}
		}),
		{numRuns: 100},
	);
});
