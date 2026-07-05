import type {FilterOptions} from '../types/intelligence.js';

/**
 * Applies post-fetch filtering, sorting, and pagination to result arrays.
 *
 * Filters are applied in this order:
 * 1. Boolean filters: verified, private, public
 * 2. Date range: since/until on the timestampField
 * 3. Text search: case-insensitive contains across textFields
 * 4. Sort: by field name, ascending by default, descending if desc is true
 * 5. Offset: skip first N items
 * 6. Limit: return at most N items
 */
export function applyFilters<T extends Record<string, unknown>>(
	items: T[],
	options: FilterOptions,
	timestampField?: string,
	textFields?: string[],
): T[] {
	let result = [...items];

	// 1. Boolean filters
	if (options.verified === true) {
		result = result.filter(item => item['isVerified'] === true);
	}

	if (options.private === true) {
		result = result.filter(item => item['isPrivate'] === true);
	}

	if (options.public === true) {
		result = result.filter(item => item['isPrivate'] === false);
	}

	// 2. Date range filters
	if (options.since && timestampField) {
		const sinceDate = new Date(options.since);
		result = result.filter(item => {
			const value = item[timestampField];
			if (typeof value !== 'string') {
				return false;
			}

			const itemDate = new Date(value);
			return itemDate > sinceDate;
		});
	}

	if (options.until && timestampField) {
		const untilDate = new Date(options.until);
		result = result.filter(item => {
			const value = item[timestampField];
			if (typeof value !== 'string') {
				return false;
			}

			const itemDate = new Date(value);
			return itemDate < untilDate;
		});
	}

	// 3. Text search (case-insensitive)
	if (options.contains && textFields && textFields.length > 0) {
		const searchLower = options.contains.toLowerCase();
		result = result.filter(item =>
			textFields.some(field => {
				const value = item[field];
				if (typeof value !== 'string') {
					return false;
				}

				return value.toLowerCase().includes(searchLower);
			}),
		);
	}

	// 4. Sort
	if (options.sort) {
		const field = options.sort;
		const descending = options.desc === true;

		result.sort((a, b) => {
			const aVal = a[field];
			const bVal = b[field];

			// Handle undefined/null values — push them to the end
			if (aVal === undefined || aVal === null) {
				return 1;
			}

			if (bVal === undefined || bVal === null) {
				return -1;
			}

			let comparison: number;

			if (typeof aVal === 'number' && typeof bVal === 'number') {
				comparison = aVal - bVal;
			} else if (typeof aVal === 'string' && typeof bVal === 'string') {
				comparison = aVal.localeCompare(bVal);
			} else {
				comparison = String(aVal).localeCompare(String(bVal));
			}

			return descending ? -comparison : comparison;
		});
	}

	// 5. Offset
	if (options.offset !== undefined && options.offset > 0) {
		result = result.slice(options.offset);
	}

	// 6. Limit
	if (options.limit !== undefined && options.limit > 0) {
		result = result.slice(0, options.limit);
	}

	return result;
}
