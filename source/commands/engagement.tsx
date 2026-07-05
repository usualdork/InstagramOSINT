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
import type {EngagementMetrics, PostEngagement} from '../types/intelligence.js';

export const description = 'Calculate engagement metrics for a user or post';

export const args = zod.tuple([
	zod.string().describe(
		argument({
			name: 'target',
			description: 'Instagram username or media_id to analyze engagement for',
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
				description:
					'Number of most recent posts to base calculations on (default 20)',
			}),
		),
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

/**
 * Detects whether the target looks like a media_id or a username.
 * Media IDs are purely numeric or follow the pattern "digits_digits"
 * (e.g. "2912345678901234567_12345678").
 * Usernames can contain underscores but also contain letters.
 */
function isMediaId(target: string): boolean {
	return /^\d+$/.test(target) || /^\d+_\d+$/.test(target);
}

export default function Engagement({args: [target], options}: Properties) {
	const run = useCallback(
		async (client: InstagramClient) => {
			const format = detectFormat(options.output);
			const isJson = format === 'json';

			if (isMediaId(target)) {
				await handlePostEngagement(client, target, format, isJson);
			} else {
				await handleUserEngagement(
					client,
					target,
					format,
					isJson,
					options.limit,
				);
			}
		},
		[target, options],
	);

	return (
		<OneTurnCommand
			username={options.username}
			output={options.output}
			run={run}
		/>
	);
}

async function handleUserEngagement(
	client: InstagramClient,
	username: string,
	format: string,
	isJson: boolean,
	limit?: number,
): Promise<void> {
	const postLimit = limit ?? 20;

	// Get user profile for follower count
	let profile;
	try {
		profile = await client.getUserProfile(username);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		const isNotFound =
			message.toLowerCase().includes('not found') ||
			message.toLowerCase().includes('user_not_found');

		if (isNotFound) {
			if (isJson) {
				outputJson({ok: false, error: `User '${username}' not found`});
			} else {
				outputText(`Error: User '${username}' not found`);
			}

			return;
		}

		throw error;
	}

	// Fetch media posts with pagination, limited by --limit
	const fetchPage = async (cursor?: string) => {
		const result = await client.getUserMedia(profile.pk, cursor);
		return {items: result.items, nextCursor: result.nextCursor};
	};

	let media;
	try {
		media = await paginate(fetchPage, {
			limit: postLimit,
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
					error: `Account '@${username}' is private. You must follow this account to view their data.`,
				});
			} else {
				outputText(
					`Error: Account '@${username}' is private\nSuggestion: You must follow this account to view their data`,
				);
			}

			return;
		}

		throw error;
	}

	if (media.length === 0) {
		if (isJson) {
			outputJson({
				ok: false,
				error:
					'Insufficient data: account has no media posts for engagement calculation',
			});
		} else {
			outputText(
				'Error: Insufficient data — account has no media posts for engagement calculation',
			);
		}

		return;
	}

	// Limit to the most recent N posts
	const posts = media.slice(0, postLimit);

	// Calculate engagement metrics
	const totalLikes = posts.reduce((sum, post) => sum + post.likeCount, 0);
	const totalComments = posts.reduce((sum, post) => sum + post.commentCount, 0);
	const averageLikes = totalLikes / posts.length;
	const averageComments = totalComments / posts.length;
	const engagementRate =
		profile.followerCount > 0
			? ((averageLikes + averageComments) / profile.followerCount) * 100
			: 0;

	const metrics: EngagementMetrics = {
		username,
		engagementRate: Math.round(engagementRate * 100) / 100,
		averageLikes: Math.round(averageLikes * 100) / 100,
		averageComments: Math.round(averageComments * 100) / 100,
		totalPostsAnalyzed: posts.length,
		followerCount: profile.followerCount,
	};

	// Format output
	if (format === 'json') {
		outputJson(jsonSuccess(metrics));
		return;
	}

	if (
		format === 'csv' ||
		format === 'yaml' ||
		format === 'markdown' ||
		format === 'table'
	) {
		const output = formatOutput(
			[metrics as unknown as Record<string, unknown>],
			{format: format as any},
		);
		outputText(output);
		return;
	}

	// Default text output
	outputText(`Engagement Metrics for @${metrics.username}`);
	outputText(`─────────────────────────────────`);
	outputText(`Engagement Rate: ${metrics.engagementRate}%`);
	outputText(`Average Likes:   ${metrics.averageLikes}`);
	outputText(`Average Comments: ${metrics.averageComments}`);
	outputText(`Posts Analyzed:  ${metrics.totalPostsAnalyzed}`);
	outputText(`Follower Count:  ${metrics.followerCount}`);
}

async function handlePostEngagement(
	client: InstagramClient,
	mediaId: string,
	format: string,
	isJson: boolean,
): Promise<void> {
	// Get media info
	let mediaInfo;
	try {
		mediaInfo = await client.getMediaInfo(mediaId);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
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

	// Resolve username from media_id to get follower count
	// The media ID format is typically "mediaId_userId"
	let followerCount = 0;
	const parts = mediaId.split('_');
	if (parts.length >= 2) {
		try {
			const userInfo = await client
				.getInstagramClient()
				.user.info(Number(parts[1]));
			followerCount = userInfo.follower_count;
		} catch {
			// If we can't resolve the user, engagement rate will be 0
		}
	}

	const engagementRate =
		followerCount > 0
			? ((mediaInfo.likeCount + mediaInfo.commentCount) / followerCount) * 100
			: 0;

	const postEngagement: PostEngagement = {
		mediaId,
		likeCount: mediaInfo.likeCount,
		commentCount: mediaInfo.commentCount,
		engagementRate: Math.round(engagementRate * 100) / 100,
		timestamp: mediaInfo.timestamp,
	};

	// Format output
	if (format === 'json') {
		outputJson(jsonSuccess(postEngagement));
		return;
	}

	if (
		format === 'csv' ||
		format === 'yaml' ||
		format === 'markdown' ||
		format === 'table'
	) {
		const output = formatOutput(
			[postEngagement as unknown as Record<string, unknown>],
			{format: format as any},
		);
		outputText(output);
		return;
	}

	// Default text output
	outputText(`Post Engagement for ${postEngagement.mediaId}`);
	outputText(`─────────────────────────────────`);
	outputText(`Likes:           ${postEngagement.likeCount}`);
	outputText(`Comments:        ${postEngagement.commentCount}`);
	outputText(`Engagement Rate: ${postEngagement.engagementRate}%`);
	outputText(`Timestamp:       ${postEngagement.timestamp}`);
}
