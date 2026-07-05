import React, {useCallback} from 'react';
import {Alert} from '@inkjs/ui';
import zod from 'zod';
import {argument, option} from 'pastel';
import StoryView from '../ui/views/story-view.js';
import {useStories} from '../ui/hooks/use-stories.js';
import {
	OneTurnCommand,
	outputJson,
	jsonSuccess,
	outputText,
} from '../utils/one-turn.js';
import {formatOutput, detectFormat} from '../utils/formatter.js';
import {type InstagramClient} from '../client.js';
import {type StoryItem} from '../types/intelligence.js';

export const description = 'Fetch and display Instagram stories in TUI';

export const args = zod.tuple([
	zod
		.string()
		.optional()
		.describe(
			argument({
				name: 'username',
				description:
					'Instagram username to fetch stories for (omit for TUI mode)',
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

function StoriesTUI(): React.ReactElement {
	const {reels, isLoading, error, loadMore, client} = useStories();

	if (isLoading) {
		return <Alert variant="info">Fetching Instagram stories...</Alert>;
	}

	if (error) {
		return <Alert variant="error">{error}</Alert>;
	}

	if (reels.length === 0 && !isLoading) {
		return <Alert variant="info">No stories to display.</Alert>;
	}

	return <StoryView reels={reels} loadMore={loadMore} client={client} />;
}

function StoriesByUsername({
	targetUsername,
	options: opts,
}: {
	targetUsername: string;
	options: Properties['options'];
}): React.ReactElement {
	const run = useCallback(
		async (client: InstagramClient) => {
			const format = detectFormat(opts.output);
			const isJson = format === 'json';

			let stories;
			try {
				stories = await client.getStoriesForUser(undefined, targetUsername);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				const isPrivateError =
					message.toLowerCase().includes('private') ||
					message.toLowerCase().includes('not authorized');
				const isNotFound =
					message.toLowerCase().includes('not found') ||
					message.toLowerCase().includes('user_not_found');

				if (isNotFound) {
					if (isJson) {
						outputJson({
							ok: false,
							error: `User '${targetUsername}' not found`,
						});
					} else {
						outputText(`Error: User '${targetUsername}' not found`);
					}

					return;
				}

				if (isPrivateError) {
					if (isJson) {
						outputJson({
							ok: false,
							error: `Account '@${targetUsername}' is private. You must follow this account to view their stories.`,
						});
					} else {
						outputText(
							`Error: Account '@${targetUsername}' is private\nSuggestion: You must follow this account to view their stories`,
						);
					}

					return;
				}

				throw error;
			}

			if (!stories || stories.length === 0) {
				if (isJson) {
					outputJson(jsonSuccess([]));
				} else {
					outputText(`No active stories for @${targetUsername}.`);
				}

				return;
			}

			// Map Story objects to StoryItem format
			const storyItems: StoryItem[] = stories.map(story => {
				const mediaType: 'image' | 'video' =
					story.media_type === 2 ? 'video' : 'image';
				const url =
					mediaType === 'video'
						? (story.video_versions?.[0]?.url ?? '')
						: (story.image_versions2?.candidates?.[0]?.url ?? '');
				const timestamp = new Date(story.taken_at * 1000).toISOString();
				// Stories expire 24 hours after posting
				const expiresAt = new Date(
					story.taken_at * 1000 + 24 * 60 * 60 * 1000,
				).toISOString();

				return {
					id: story.id,
					mediaType,
					timestamp,
					expiresAt,
					url,
				};
			});

			// Format output
			const items = storyItems as unknown as Record<string, unknown>[];

			if (format === 'json') {
				outputJson(jsonSuccess(storyItems));
				return;
			}

			if (
				format === 'csv' ||
				format === 'yaml' ||
				format === 'markdown' ||
				format === 'table'
			) {
				const output = formatOutput(items, {format});
				outputText(output);
				return;
			}

			// Default text output
			for (const item of storyItems) {
				outputText(
					`[${item.mediaType}] ${item.id} — ${item.timestamp} (expires: ${item.expiresAt})`,
				);
			}
		},
		[targetUsername, opts],
	);

	return (
		<OneTurnCommand username={opts.username} output={opts.output} run={run} />
	);
}

export default function Stories({
	args: [targetUsername],
	options: opts,
}: Properties): React.ReactElement {
	// When a username argument is provided, use OneTurnCommand mode
	if (targetUsername) {
		return <StoriesByUsername targetUsername={targetUsername} options={opts} />;
	}

	// No username provided — keep existing TUI behavior
	return <StoriesTUI />;
}
