import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export interface CacheEntry<T> {
	data: T;
	expiresAt: number; // Unix timestamp in milliseconds
}

/** Default TTL for profile and media data (seconds). */
export const DEFAULT_TTL_PROFILE = 300;

/** Default TTL for stories data (seconds). */
export const DEFAULT_TTL_STORIES = 60;

const CACHE_DIR = path.join(os.homedir(), '.igosint', 'cache');

/**
 * Filesystem-based response cache with TTL expiration.
 * Stores JSON files in ~/.igosint/cache/.
 */
export class CacheManager {
	/**
	 * Retrieves a cached value by key.
	 * Returns undefined if the entry does not exist or has expired.
	 */
	static get<T>(key: string): T | undefined {
		const filePath = CacheManager.keyToPath(key);

		try {
			const raw = fs.readFileSync(filePath, 'utf8');
			const entry: CacheEntry<T> = JSON.parse(raw) as CacheEntry<T>;

			if (Date.now() > entry.expiresAt) {
				// Entry has expired — remove the stale file
				try {
					fs.unlinkSync(filePath);
				} catch {
					// Ignore cleanup errors
				}

				return undefined;
			}

			return entry.data;
		} catch {
			return undefined;
		}
	}

	/**
	 * Stores a value in the cache with a specified TTL in seconds.
	 */
	static set<T>(key: string, data: T, ttlSeconds: number): void {
		const filePath = CacheManager.keyToPath(key);

		const entry: CacheEntry<T> = {
			data,
			expiresAt: Date.now() + ttlSeconds * 1000,
		};

		// Ensure the cache directory exists
		fs.mkdirSync(CACHE_DIR, {recursive: true});
		fs.writeFileSync(filePath, JSON.stringify(entry), 'utf8');
	}

	/**
	 * Removes all entries from the cache directory.
	 */
	static clear(): void {
		try {
			const files = fs.readdirSync(CACHE_DIR);
			for (const file of files) {
				try {
					fs.unlinkSync(path.join(CACHE_DIR, file));
				} catch {
					// Ignore individual file deletion errors
				}
			}
		} catch {
			// Directory may not exist — nothing to clear
		}
	}

	/**
	 * Builds a cache key from a command name and its arguments.
	 * Produces a filesystem-safe filename using a SHA-256 hash.
	 */
	static buildKey(command: string, ...args: string[]): string {
		const raw = [command, ...args].join(':');
		const hash = crypto.createHash('sha256').update(raw).digest('hex');
		return `${command}-${hash}`;
	}

	/**
	 * Resolves a cache key to an absolute file path.
	 */
	private static keyToPath(key: string): string {
		// Sanitize key for filesystem safety (replace non-alphanumeric except dash/underscore)
		const safeKey = key.replaceAll(/[^a-zA-Z0-9\-_]/g, '_');
		return path.join(CACHE_DIR, `${safeKey}.json`);
	}
}
