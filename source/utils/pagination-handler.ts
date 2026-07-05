import type {PaginationOptions} from '../types/intelligence.js';

/**
 * Iterates through paginated API responses, collecting all items.
 *
 * Behavior:
 * - If `all` is false/undefined and no `limit` is set, fetches one page only
 * - If `all` is true, fetches all pages until no nextCursor is returned
 * - If `limit` is set, stops once the accumulated items reach the limit
 * - Calls `onProgress` after each page fetch with the running total
 * - If no `onProgress` callback is provided, writes progress to stderr
 */
export async function paginate<T>(
	fetchPage: (cursor?: string) => Promise<{items: T[]; nextCursor?: string}>,
	options: PaginationOptions,
): Promise<T[]> {
	const {all, limit, onProgress} = options;
	const items: T[] = [];
	let cursor: string | undefined;

	const reportProgress =
		onProgress ??
		((fetched: number) => {
			process.stderr.write(`Fetched ${fetched} items...\n`);
		});

	// Determine whether we should paginate beyond the first page
	const shouldPaginateAll = all === true || (limit !== undefined && limit > 0);

	// Fetch at least the first page
	const firstPage = await fetchPage(cursor);
	items.push(...firstPage.items);
	reportProgress(items.length);

	// If we shouldn't paginate further, return after first page
	if (!shouldPaginateAll) {
		return items;
	}

	cursor = firstPage.nextCursor;

	// If limit is set and we already have enough, return early
	if (limit !== undefined && limit > 0 && items.length >= limit) {
		return items.slice(0, limit);
	}

	// Continue fetching pages while there's a cursor
	while (cursor) {
		const page = await fetchPage(cursor);
		items.push(...page.items);
		reportProgress(items.length);

		// Stop if we've reached the limit
		if (limit !== undefined && limit > 0 && items.length >= limit) {
			return items.slice(0, limit);
		}

		cursor = page.nextCursor;
	}

	return items;
}
