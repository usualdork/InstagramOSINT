import React, {useCallback} from 'react';
import zod from 'zod';
import {argument, option} from 'pastel';
import fs from 'node:fs';
import path from 'node:path';
import {OneTurnCommand, outputText} from '../utils/one-turn.js';
import {formatOutput} from '../utils/formatter.js';
import {paginate} from '../utils/pagination-handler.js';
import {type InstagramClient} from '../client.js';
import type {OutputFormat} from '../types/intelligence.js';

export const description =
	'Export followers, following, or media data to a file (CSV, JSON, YAML)';

export const args = zod.tuple([
	zod.string().describe(
		argument({
			name: 'type',
			description: 'Data to export: followers, following, or media',
		}),
	),
	zod.string().describe(
		argument({
			name: 'user',
			description: 'Instagram username to export data for',
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
				description: 'Output format: json, csv, yaml (default: json)',
			}),
		),
	file: zod
		.string()
		.optional()
		.describe(
			option({
				alias: 'f',
				description: 'Output file path (default: ./<type>_<user>.<format>)',
			}),
		),
	limit: zod
		.number()
		.optional()
		.describe(
			option({
				alias: 'l',
				description: 'Maximum items to export (default: all)',
			}),
		),
	fields: zod
		.string()
		.optional()
		.describe(
			option({
				description:
					'Comma-separated list of fields to include (e.g. username,fullName,isVerified)',
			}),
		),
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

export default function Export({args: [type, user], options}: Properties) {
	const run = useCallback(
		async (client: InstagramClient) => {
			const validTypes = ['followers', 'following', 'media'];
			if (!validTypes.includes(type)) {
				outputText(
					`Error: Invalid type '${type}'. Must be one of: ${validTypes.join(', ')}`,
				);
				return;
			}

			const format: OutputFormat = (options.output as OutputFormat) ?? 'json';
			if (!['json', 'csv', 'yaml'].includes(format)) {
				outputText(
					`Error: Invalid format '${format}'. Must be one of: json, csv, yaml`,
				);
				return;
			}

			// Resolve user pk
			let userId: string;
			try {
				const profile = await client.getUserProfile(user);
				userId = profile.pk;
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				outputText(`Error: User '${user}' not found — ${message}`);
				return;
			}

			outputText(`Fetching ${type} for @${user}...`);

			let data: Record<string, unknown>[];

			if (type === 'followers') {
				const fetchPage = async (cursor?: string) => {
					const result = await client.getFollowers(userId, cursor);
					return {items: result.users, nextCursor: result.nextCursor};
				};

				const items = await paginate(fetchPage, {
					all: options.limit === undefined,
					limit: options.limit,
				});
				data = items as unknown as Record<string, unknown>[];
			} else if (type === 'following') {
				const fetchPage = async (cursor?: string) => {
					const result = await client.getFollowing(userId, cursor);
					return {items: result.users, nextCursor: result.nextCursor};
				};

				const items = await paginate(fetchPage, {
					all: options.limit === undefined,
					limit: options.limit,
				});
				data = items as unknown as Record<string, unknown>[];
			} else {
				// media
				const fetchPage = async (cursor?: string) => {
					const result = await client.getUserMedia(userId, cursor);
					return {items: result.items, nextCursor: result.nextCursor};
				};

				const items = await paginate(fetchPage, {
					all: options.limit === undefined,
					limit: options.limit,
				});
				data = items as unknown as Record<string, unknown>[];
			}

			if (data.length === 0) {
				outputText(`No ${type} found for @${user}.`);
				return;
			}

			// Apply field filtering if specified
			const fieldsList = options.fields?.split(',').map(f => f.trim());

			// Format the output
			const formatted = formatOutput(data, {
				format,
				fields: fieldsList,
			});

			// Determine output file path
			const ext = format === 'yaml' ? 'yaml' : format;
			const defaultFilename = `${type}_${user}.${ext}`;
			const filePath = options.file ?? defaultFilename;

			// Ensure directory exists
			const dir = path.dirname(filePath);
			if (dir !== '.') {
				fs.mkdirSync(dir, {recursive: true});
			}

			// Write to file
			fs.writeFileSync(filePath, formatted, 'utf8');
			outputText(`Exported ${data.length} ${type} to ${filePath}`);
		},
		[type, user, options],
	);

	return (
		<OneTurnCommand
			username={options.username}
			output={options.output}
			run={run}
		/>
	);
}
