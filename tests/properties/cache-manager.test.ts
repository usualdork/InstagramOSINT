import test from 'ava';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {CacheManager} from '../../source/utils/cache-manager.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CACHE_DIR = path.join(os.homedir(), '.igosint', 'cache');

/**
 * Resolves a cache key to its file path (mirrors CacheManager.keyToPath logic).
 */
function keyToPath(key: string): string {
	const safeKey = key.replaceAll(/[^a-zA-Z0-9\-_]/g, '_');
	return path.join(CACHE_DIR, `${safeKey}.json`);
}

/**
 * Removes a cache file for a given key, ignoring errors.
 */
function cleanupKey(key: string): void {
	try {
		fs.unlinkSync(keyToPath(key));
	} catch {
		// Ignore
	}
}

// ── Generators ────────────────────────────────────────────────────────────────

/**
 * Generates filesystem-safe cache keys: alphanumeric with dashes/underscores.
 */
const cacheKeyArb = fc
	.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{2,20}$/)
	.map(k => `test-prop-${k}`);

/**
 * Generates JSON-serializable values suitable for cache storage.
 * Excludes -0 and NaN/Infinity which don't round-trip through JSON.
 */
const cacheValueArb: fc.Arbitrary<unknown> = fc.oneof(
	fc.string(),
	fc.integer(),
	fc
		.double({noNaN: true, noDefaultInfinity: true})
		.filter(n => !Object.is(n, -0)),
	fc.boolean(),
	fc.constant(null),
	fc.array(
		fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
		{
			maxLength: 5,
		},
	),
	fc.dictionary(
		fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,5}$/),
		fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
	),
);

/**
 * Generates a positive TTL in seconds (1–3600).
 */
const positiveTtlArb = fc.integer({min: 1, max: 3600});

// ── Property 13: Cache Round-Trip ─────────────────────────────────────────────
// Feature: instagram-intelligence, Property 13: Cache Round-Trip

test('Property 13: Cache Round-Trip — store and immediately retrieve returns original value', t => {
	// **Validates: Requirements 19.1, 19.2**
	const keysUsed: string[] = [];

	try {
		fc.assert(
			fc.property(
				cacheKeyArb,
				cacheValueArb,
				positiveTtlArb,
				(key, value, ttl) => {
					keysUsed.push(key);

					// Store value in cache
					CacheManager.set(key, value, ttl);

					// Immediately retrieve
					const retrieved = CacheManager.get<unknown>(key);

					// Retrieved value must deeply equal the original
					t.deepEqual(
						retrieved,
						value,
						`Cache round-trip failed for key "${key}"`,
					);
				},
			),
			{numRuns: 100},
		);
	} finally {
		// Cleanup all keys used during the test
		for (const key of keysUsed) {
			cleanupKey(key);
		}
	}
});

// ── Property 14: Cache TTL Expiration ─────────────────────────────────────────
// Feature: instagram-intelligence, Property 14: Cache TTL Expiration

test('Property 14: Cache TTL Expiration — retrieval after TTL elapsed returns undefined', t => {
	// **Validates: Requirements 19.4**
	const keysUsed: string[] = [];

	try {
		fc.assert(
			fc.property(
				cacheKeyArb,
				cacheValueArb,
				positiveTtlArb,
				(key, value, ttl) => {
					keysUsed.push(key);

					// Store value in cache with a valid TTL
					CacheManager.set(key, value, ttl);

					// Directly manipulate the cache file to simulate expiration:
					// Set expiresAt to a time in the past
					const filePath = keyToPath(key);
					const raw = fs.readFileSync(filePath, 'utf8');
					const entry = JSON.parse(raw) as {data: unknown; expiresAt: number};
					entry.expiresAt = Date.now() - 1000; // Expired 1 second ago
					fs.writeFileSync(filePath, JSON.stringify(entry), 'utf8');

					// Retrieve after "expiration" — should return undefined
					const retrieved = CacheManager.get<unknown>(key);

					t.is(
						retrieved,
						undefined,
						`Expected undefined for expired key "${key}", but got a value`,
					);
				},
			),
			{numRuns: 100},
		);
	} finally {
		// Cleanup all keys used during the test
		for (const key of keysUsed) {
			cleanupKey(key);
		}
	}
});
