import React, {useCallback} from 'react';
import zod from 'zod';
import {argument, option} from 'pastel';
import {
	OneTurnCommand,
	outputJson,
	jsonSuccess,
	outputText,
} from '../../utils/one-turn.js';
import {formatOutput, detectFormat} from '../../utils/formatter.js';
import {applyFilters} from '../../utils/filter-engine.js';
import {type InstagramClient} from '../../client.js';

export const description = 'Search for Instagram locations by query';

export const args = zod.tuple([
	zod.string().describe(
		argument({
			name: 'query',
			description: 'Search query string',
		}),
	),
]);

export const options = zod.object({
	username: zod
		.string()
		.optional()
		.describe(
			option({
				alias: 'u',
				description: 'Account username to use for authentication',
			}),
		),
	output: zod
		.string()
		.optional()
		.describe(
			option({
				alias: 'o',
				description: 'Output format (json, csv, yaml, markdown, table)',
			}),
		),
	limit: zod
		.number()
		.optional()
		.describe(
			option({
				alias: 'l',
				description: 'Maximum number of results to return',
			}),
		),
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

export default function SearchLocations({args: [query], options}: Properties) {
	const run = useCallback(
		async (client: InstagramClient) => {
			const format = detectFormat(options.output);
			const isJson = format === 'json';

			// Search locations via API
			const results = await client.searchLocations(query);

			// Apply filters (limit)
			const filtered = applyFilters(
				results as unknown as Record<string, unknown>[],
				{
					limit: options.limit,
				},
			);

			if (filtered.length === 0) {
				if (isJson) {
					outputJson(jsonSuccess([]));
				} else {
					outputText('No locations found matching the query.');
				}

				return;
			}

			// Format output
			if (format === 'json') {
				outputJson(jsonSuccess(filtered));
				return;
			}

			if (
				format === 'csv' ||
				format === 'yaml' ||
				format === 'markdown' ||
				format === 'table'
			) {
				const output = formatOutput(filtered, {format});
				outputText(output);
				return;
			}

			// Default text output
			for (const location of filtered) {
				const name = location['name'] as string;
				const address = location['address']
					? ` - ${location['address'] as string}`
					: '';
				const lat = location['lat'] as number | undefined;
				const lng = location['lng'] as number | undefined;
				const coords =
					lat !== undefined && lng !== undefined ? ` (${lat}, ${lng})` : '';
				outputText(`${name}${address}${coords}`);
			}
		},
		[query, options],
	);

	return (
		<OneTurnCommand
			username={options.username}
			output={options.output}
			run={run}
		/>
	);
}
