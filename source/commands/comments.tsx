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

export const description = 'Retrieve comments on a media post';

export const args = zod.tuple([
	zod.string().describe(
		argument({
			name: 'mediaId',
			description: 'Media ID to retrieve comments for',
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
				description: 'Maximum number of comments to return',
			}),
		),
	all: zod
		.boolean()
		.optional()
		.describe(
			option({
				description: 'Fetch all comments (paginate automatically)',
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
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

export default function Comments({args: [mediaId], options}: Properties) {
	const run = useCallback(
		async (client: InstagramClient) => {
			const format = detectFormat(options.output);
			const isJson = format === 'json';

			// Fetch comments with pagination
			const fetchPage = async (cursor?: string) => {
				const result = await client.getMediaComments(
					mediaId,
					cursor,
					options.pageSize,
				);
				return {items: result.comments, nextCursor: result.nextCursor};
			};

			let comments;
			try {
				comments = await paginate(fetchPage, {
					all: options.all,
					limit: options.limit,
					pageSize: options.pageSize,
				});
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				const isCommentsDisabled =
					message.toLowerCase().includes('comments') &&
					message.toLowerCase().includes('disabled');

				if (isCommentsDisabled) {
					if (isJson) {
						outputJson({
							ok: false,
							error: 'Comments are disabled on this post',
						});
					} else {
						outputText('Error: Comments are disabled on this post');
					}

					return;
				}

				const isNotFound =
					message.toLowerCase().includes('not found') ||
					message.toLowerCase().includes('not exist') ||
					message.toLowerCase().includes('media_not_found');

				if (isNotFound) {
					if (isJson) {
						outputJson({
							ok: false,
							error: `Media '${mediaId}' not found or inaccessible`,
						});
					} else {
						outputText(`Error: Media '${mediaId}' not found or inaccessible`);
					}

					return;
				}

				throw error;
			}

			// Apply filters
			const filtered = applyFilters(
				comments as unknown as Record<string, unknown>[],
				{
					limit: options.limit,
					offset: options.offset,
				},
				'timestamp',
				['username', 'text'],
			);

			if (filtered.length === 0) {
				if (isJson) {
					outputJson(jsonSuccess([]));
				} else {
					outputText('No comments found.');
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
			for (const comment of filtered) {
				const likes =
					Number(comment['likeCount']) > 0
						? ` [♥ ${comment['likeCount']}]`
						: '';
				outputText(
					`@${comment['username']} (${comment['timestamp']})${likes}\n  ${comment['text']}`,
				);
			}
		},
		[mediaId, options],
	);

	return (
		<OneTurnCommand
			username={options.username}
			output={options.output}
			run={run}
		/>
	);
}
