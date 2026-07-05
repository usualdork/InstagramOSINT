/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import test from 'ava';
import fc from 'fast-check';
import {parse} from 'csv-parse/sync';
import yaml from 'js-yaml';
import {formatOutput} from '../../source/utils/formatter.js';

// ── Generators ────────────────────────────────────────────────────────────────

/**
 * Generates a record with string, number, boolean, and null values.
 * Keys are simple alphanumeric identifiers to ensure valid column names.
 */
const jsonRecordArb = fc
	.dictionary(
		fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,9}$/),
		fc.oneof(
			fc.string(),
			fc.integer(),
			fc
				.double({noNaN: true, noDefaultInfinity: true})
				.filter(n => !Object.is(n, -0)),
			fc.boolean(),
			fc.constant(null),
		),
	)
	.filter(r => Object.keys(r).length > 0);

/**
 * Generates a non-empty array of records all sharing the same shape (same keys).
 * This is necessary for CSV/table formatters which require consistent columns.
 */
function uniformRecordsArb(
	valueArb: fc.Arbitrary<unknown>,
): fc.Arbitrary<Record<string, unknown>[]> {
	return fc
		.array(fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,9}$/), {
			minLength: 1,
			maxLength: 5,
		})
		.chain(keys => {
			const uniqueKeys = [...new Set(keys)];
			if (uniqueKeys.length === 0) {
				return fc.constant([{a: 'default'}] as Record<string, unknown>[]);
			}

			const recordArb = fc.record(
				Object.fromEntries(uniqueKeys.map(k => [k, valueArb])),
			);
			return fc.array(recordArb, {minLength: 1, maxLength: 10});
		});
}

/**
 * Value generator for CSV: strings (including special chars) and numbers.
 * We use printable ASCII plus explicit special characters to exercise escaping.
 * We avoid bare \r which causes ambiguous record separators in CSV parsing.
 */
const csvValueArb = fc.oneof(
	fc.stringMatching(/^[a-zA-Z0-9 ]{0,20}$/),
	fc.constantFrom(
		'hello, world',
		'say "hi"',
		'line1\nline2',
		'a"b"c',
		'x,y,z',
		'',
	),
	fc.integer(),
	fc
		.double({noNaN: true, noDefaultInfinity: true})
		.filter(n => !Object.is(n, -0)),
);

/**
 * Value generator for JSON/YAML: string, number, boolean, null.
 * Excludes -0 which doesn't round-trip through JSON.
 */
const jsonValueArb = fc.oneof(
	fc.string(),
	fc.integer(),
	fc
		.double({noNaN: true, noDefaultInfinity: true})
		.filter(n => !Object.is(n, -0)),
	fc.boolean(),
	fc.constant(null),
);

// ── Property 1: JSON Formatter Round-Trip ─────────────────────────────────────
// Feature: instagram-intelligence, Property 1: JSON Formatter Round-Trip

test('Property 1: JSON Formatter Round-Trip — format as JSON, parse back, verify equivalence', t => {
	// **Validates: Requirements 16.1, 21.1**
	fc.assert(
		fc.property(
			fc.array(jsonRecordArb, {minLength: 1, maxLength: 10}),
			data => {
				const output = formatOutput(data, {format: 'json'});
				const parsed = JSON.parse(output) as Record<string, unknown>[];

				// Parsed output must deeply equal the original input
				t.deepEqual(parsed, data);
			},
		),
		{numRuns: 100},
	);
});

// ── Property 2: CSV Formatter Round-Trip ──────────────────────────────────────
// Feature: instagram-intelligence, Property 2: CSV Formatter Round-Trip

test('Property 2: CSV Formatter Round-Trip — format as CSV, parse back, verify field values including special chars', t => {
	// **Validates: Requirements 16.2, 21.2, 21.4**
	fc.assert(
		fc.property(uniformRecordsArb(csvValueArb), data => {
			const output = formatOutput(data, {format: 'csv'});
			// Add trailing newline for unambiguous parsing (RFC 4180 recommends CRLF at end)
			const parsed = parse(output + '\n', {
				columns: true,
				skip_empty_lines: false,
				relax_column_count: true,
			}) as Record<string, string>[];

			// Must have same number of rows
			t.is(parsed.length, data.length);

			// Each field value when stringified must match the parsed CSV value
			const headers = Object.keys(data[0]!);
			for (let i = 0; i < data.length; i++) {
				for (const key of headers) {
					const originalValue = data[i]![key];
					const expectedStr = stringifyValue(originalValue);
					const parsedValue = parsed[i]![key];
					t.is(
						parsedValue,
						expectedStr,
						`Row ${i}, column "${key}": expected "${expectedStr}" but got "${parsedValue}"`,
					);
				}
			}
		}),
		{numRuns: 100},
	);
});

// ── Property 3: YAML Formatter Round-Trip ─────────────────────────────────────
// Feature: instagram-intelligence, Property 3: YAML Formatter Round-Trip

test('Property 3: YAML Formatter Round-Trip — format as YAML, parse back, verify equivalence', t => {
	// **Validates: Requirements 16.3, 21.3**
	fc.assert(
		fc.property(
			fc.array(jsonRecordArb, {minLength: 1, maxLength: 10}),
			data => {
				const output = formatOutput(data, {format: 'yaml'});
				const parsed = yaml.load(output) as Record<string, unknown>[];

				// Parsed YAML output must deeply equal the original input
				t.deepEqual(parsed, data);
			},
		),
		{numRuns: 100},
	);
});

// ── Property 4: Markdown/Table Formatter Completeness ─────────────────────────
// Feature: instagram-intelligence, Property 4: Markdown/Table Formatter Completeness

test('Property 4: Markdown/Table Formatter Completeness — verify all field values appear in output', t => {
	// **Validates: Requirements 16.4, 16.5**
	fc.assert(
		fc.property(
			uniformRecordsArb(jsonValueArb),
			fc.constantFrom('markdown' as const, 'table' as const),
			(data, format) => {
				const output = formatOutput(data, {format});

				// Every field value (stringified) must appear somewhere in the output
				for (const row of data) {
					for (const value of Object.values(row)) {
						const strValue = stringifyValue(value);
						// Empty strings (from null/undefined) trivially appear in any output
						if (strValue === '') {
							continue;
						}

						// For markdown, pipes in values are escaped as \|
						// For table format, values appear as-is
						const searchValue =
							format === 'markdown'
								? strValue.replaceAll('|', '\\|').replaceAll('\n', ' ')
								: strValue;

						t.true(
							output.includes(searchValue),
							`Expected output to contain "${searchValue}" (format: ${format})`,
						);
					}
				}
			},
		),
		{numRuns: 100},
	);
});

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Mirrors the stringifyValue logic from the formatter for test assertions.
 */
function stringifyValue(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	if (typeof value === 'object') {
		return JSON.stringify(value);
	}

	return String(value);
}
