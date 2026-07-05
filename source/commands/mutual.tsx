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
import {paginate} from '../utils/pagination-handler.js';
import {type InstagramClient} from '../client.js';

export const description = 'Find mutual connections between two users';

export const args = zod.tuple([
	zod.string().describe(
		argument({
			name: 'user1',
			description: 'First Instagram username (without @)',
		}),
	),
	zod.string().describe(
		argument({
			name: 'user2',
			description: 'Second Instagram username (without @)',
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
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

export default function Mutual({args: [user1, user2], options}: Properties) {
	const run = useCallback(
		async (client: InstagramClient) => {
			const format = detectFormat(options.output);
			const isJson = format === 'json';

			// Resolve user1's pk
			let userId1: string;
			try {
				const profile1 = await client.getUserProfile(user1);
				userId1 = profile1.pk;
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				const isNotFound =
					message.toLowerCase().includes('not found') ||
					message.toLowerCase().includes('user_not_found');

				if (isNotFound) {
					if (isJson) {
						outputJson({ok: false, error: `User '${user1}' not found`});
					} else {
						outputText(`Error: User '${user1}' not found`);
					}

					return;
				}

				throw error;
			}

			// Resolve user2's pk
			let userId2: string;
			try {
				const profile2 = await client.getUserProfile(user2);
				userId2 = profile2.pk;
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				const isNotFound =
					message.toLowerCase().includes('not found') ||
					message.toLowerCase().includes('user_not_found');

				if (isNotFound) {
					if (isJson) {
						outputJson({ok: false, error: `User '${user2}' not found`});
					} else {
						outputText(`Error: User '${user2}' not found`);
					}

					return;
				}

				throw error;
			}

			// Fetch all following for user1
			const fetchUser1Following = async (cursor?: string) => {
				const result = await client.getFollowing(userId1, cursor);
				return {items: result.users, nextCursor: result.nextCursor};
			};

			let following1;
			try {
				following1 = await paginate(fetchUser1Following, {all: true});
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				const isPrivateError =
					message.toLowerCase().includes('private') ||
					message.toLowerCase().includes('not authorized');

				if (isPrivateError) {
					if (isJson) {
						outputJson({
							ok: false,
							error: `Account '@${user1}' is private and inaccessible. Cannot retrieve their following list.`,
						});
					} else {
						outputText(
							`Error: Account '@${user1}' is private and inaccessible\nSuggestion: You must follow this account to view their data`,
						);
					}

					return;
				}

				throw error;
			}

			// Fetch all following for user2
			const fetchUser2Following = async (cursor?: string) => {
				const result = await client.getFollowing(userId2, cursor);
				return {items: result.users, nextCursor: result.nextCursor};
			};

			let following2;
			try {
				following2 = await paginate(fetchUser2Following, {all: true});
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				const isPrivateError =
					message.toLowerCase().includes('private') ||
					message.toLowerCase().includes('not authorized');

				if (isPrivateError) {
					if (isJson) {
						outputJson({
							ok: false,
							error: `Account '@${user2}' is private and inaccessible. Cannot retrieve their following list.`,
						});
					} else {
						outputText(
							`Error: Account '@${user2}' is private and inaccessible\nSuggestion: You must follow this account to view their data`,
						);
					}

					return;
				}

				throw error;
			}

			// Compute set intersection by pk
			const user2Pks = new Set(following2.map(u => u.pk));
			const mutual = following1.filter(u => user2Pks.has(u.pk));

			// Display count and list
			if (mutual.length === 0) {
				if (isJson) {
					outputJson(jsonSuccess({count: 0, mutual: []}));
				} else {
					outputText(
						`No mutual connections found between @${user1} and @${user2}.`,
					);
				}

				return;
			}

			// Format output
			if (format === 'json') {
				outputJson(
					jsonSuccess({
						count: mutual.length,
						mutual: mutual as unknown as Record<string, unknown>[],
					}),
				);
				return;
			}

			if (
				format === 'csv' ||
				format === 'yaml' ||
				format === 'markdown' ||
				format === 'table'
			) {
				outputText(
					`Mutual connections between @${user1} and @${user2}: ${mutual.length}`,
				);
				outputText('');
				const output = formatOutput(
					mutual as unknown as Record<string, unknown>[],
					{format},
				);
				outputText(output);
				return;
			}

			// Default text output
			outputText(
				`Mutual connections between @${user1} and @${user2}: ${mutual.length}`,
			);
			outputText('');
			for (const connection of mutual) {
				const verified = connection.isVerified ? ' ✓' : '';
				const privacy = connection.isPrivate ? ' [private]' : '';
				outputText(
					`@${connection.username}${verified}${privacy} — ${connection.fullName ?? ''}`,
				);
			}
		},
		[user1, user2, options],
	);

	return (
		<OneTurnCommand
			username={options.username}
			output={options.output}
			run={run}
		/>
	);
}
