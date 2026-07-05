import React, {useCallback} from 'react';
import zod from 'zod';
import {argument, option} from 'pastel';
import {
	OneTurnCommand,
	outputJson,
	jsonSuccess,
	outputText,
} from '../utils/one-turn.js';
import {formatOutput, detectFormat} from '../utils/formatter.js';
import {applyFilters} from '../utils/filter-engine.js';
import {paginate} from '../utils/pagination-handler.js';
import {type InstagramClient} from '../client.js';

export const description = 'List followers for a user';

export const args = zod.tuple([
	zod.string().describe(
		argument({
			name: 'user',
			description: 'Instagram username to look up (without @)',
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
				description: 'Maximum number of followers to return',
			}),
		),
	all: zod
		.boolean()
		.optional()
		.describe(
			option({
				description: 'Fetch all followers (paginate automatically)',
			}),
		),
	sort: zod
		.string()
		.optional()
		.describe(
			option({
				description: 'Sort by field name',
			}),
		),
	desc: zod
		.boolean()
		.optional()
		.describe(
			option({
				description: 'Sort in descending order',
			}),
		),
	verified: zod
		.boolean()
		.optional()
		.describe(
			option({
				description: 'Only show verified accounts',
			}),
		),
	private: zod
		.boolean()
		.optional()
		.describe(
			option({
				description: 'Only show private accounts',
			}),
		),
	public: zod
		.boolean()
		.optional()
		.describe(
			option({
				description: 'Only show public accounts',
			}),
		),
	pageSize: zod
		.number()
		.optional()
		.describe(
			option({
				description: 'Number of items per API page',
			}),
		),
	noCache: zod
		.boolean()
		.optional()
		.describe(
			option({
				description: 'Bypass local cache',
			}),
		),
	cacheTtl: zod
		.number()
		.optional()
		.describe(
			option({
				description: 'Cache TTL in seconds',
			}),
		),
	delay: zod
		.number()
		.optional()
		.describe(
			option({
				description: 'Delay between API requests in milliseconds',
			}),
		),
	offset: zod
		.number()
		.optional()
		.describe(
			option({
				description: 'Skip the first N items',
			}),
		),
	contains: zod
		.string()
		.optional()
		.describe(
			option({
				description: 'Filter by text search in username/full name',
			}),
		),
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

export default function Followers({args: [user], options}: Properties) {
	const run = useCallback(
		async (client: InstagramClient) => {
			const format = detectFormat(options.output);
			const isJson = format === 'json';

			// Resolve the user's pk
			let userId: string;
			try {
				const profile = await client.getUserProfile(user);
				userId = profile.pk;
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				const isNotFound =
					message.toLowerCase().includes('not found') ||
					message.toLowerCase().includes('user_not_found');

				if (isNotFound) {
					if (isJson) {
						outputJson({ok: false, error: `User '${user}' not found`});
					} else {
						outputText(`Error: User '${user}' not found`);
					}

					return;
				}

				throw error;
			}

			// Fetch followers with pagination
			const fetchPage = async (cursor?: string) => {
				const result = await client.getFollowers(
					userId,
					cursor,
					options.pageSize,
				);
				return {items: result.users, nextCursor: result.nextCursor};
			};

			let followers;
			try {
				followers = await paginate(fetchPage, {
					all: options.all,
					limit: options.limit,
					pageSize: options.pageSize,
				});
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				const isPrivateError =
					message.toLowerCase().includes('private') ||
					message.toLowerCase().includes('not authorized');

				if (isPrivateError) {
					if (isJson) {
						outputJson({
							ok: false,
							error: `Account '@${user}' is private. You must follow this account to view their data.`,
						});
					} else {
						outputText(
							`Error: Account '@${user}' is private\nSuggestion: You must follow this account to view their data`,
						);
					}

					return;
				}

				throw error;
			}

			// Apply filters
			const filtered = applyFilters(
				followers as unknown as Record<string, unknown>[],
				{
					limit: options.limit,
					offset: options.offset,
					sort: options.sort,
					desc: options.desc,
					contains: options.contains,
					verified: options.verified,
					private: options.private,
					public: options.public,
				},
				undefined,
				['username', 'fullName'],
			);

			if (filtered.length === 0) {
				if (isJson) {
					outputJson(jsonSuccess([]));
				} else {
					outputText('No followers found.');
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
			for (const follower of filtered) {
				const verified = follower['isVerified'] ? ' ✓' : '';
				const privacy = follower['isPrivate'] ? ' [private]' : '';
				outputText(
					`@${follower['username']}${verified}${privacy} — ${follower['fullName'] ?? ''}`,
				);
			}
		},
		[user, options],
	);

	return (
		<OneTurnCommand
			username={options.username}
			output={options.output}
			run={run}
		/>
	);
}
