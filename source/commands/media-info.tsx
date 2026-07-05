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
import {type InstagramClient} from '../client.js';

export const description = 'Display detailed information about a media post';

export const args = zod.tuple([
	zod.string().describe(
		argument({
			name: 'mediaId',
			description: 'The media ID to look up',
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

export default function MediaInfo({args: [mediaId], options}: Properties) {
	const run = useCallback(
		async (client: InstagramClient) => {
			const format = detectFormat(options.output);
			const isJson = format === 'json';

			let media;
			try {
				media = await client.getMediaInfo(mediaId);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				const isNotFound =
					message.toLowerCase().includes('not found') ||
					message.toLowerCase().includes('media_not_found') ||
					message.toLowerCase().includes('does not exist') ||
					message.toLowerCase().includes('inaccessible');

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

			// JSON output: full MediaDetail object
			if (format === 'json') {
				outputJson(jsonSuccess(media));
				return;
			}

			// Structured format output (csv, yaml, markdown, table)
			if (
				format === 'csv' ||
				format === 'yaml' ||
				format === 'markdown' ||
				format === 'table'
			) {
				const record: Record<string, unknown> = {
					id: media.id,
					mediaType: media.mediaType,
					caption: media.caption ?? '',
					timestamp: media.timestamp,
					likeCount: media.likeCount,
					commentCount: media.commentCount,
					taggedUsers: media.taggedUsers.join(', '),
					hashtags: media.hashtags.join(', '),
					location: media.location?.name ?? '',
					carouselItems: media.carouselItems ? media.carouselItems.length : 0,
					url: media.url,
				};
				const output = formatOutput([record], {format});
				outputText(output);
				return;
			}

			// Default text output
			outputText(`Media: ${media.id}`);
			outputText(`  Type:          ${media.mediaType}`);
			outputText(`  Timestamp:     ${media.timestamp}`);
			outputText(`  Likes:         ${media.likeCount}`);
			outputText(`  Comments:      ${media.commentCount}`);

			if (media.caption) {
				outputText(`  Caption:       ${media.caption}`);
			}

			if (media.taggedUsers.length > 0) {
				outputText(
					`  Tagged Users:  ${media.taggedUsers.map(u => `@${u}`).join(', ')}`,
				);
			}

			if (media.hashtags.length > 0) {
				outputText(`  Hashtags:      ${media.hashtags.join(', ')}`);
			}

			if (media.location) {
				let locationStr = media.location.name;
				if (
					media.location.lat !== undefined &&
					media.location.lng !== undefined
				) {
					locationStr += ` (${media.location.lat}, ${media.location.lng})`;
				}

				outputText(`  Location:      ${locationStr}`);
			}

			if (media.carouselItems && media.carouselItems.length > 0) {
				outputText(`  Carousel Items:`);
				for (const [index, item] of media.carouselItems.entries()) {
					outputText(`    ${index + 1}. [${item.mediaType}] ${item.url}`);
				}
			}

			outputText(`  URL:           ${media.url}`);
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
