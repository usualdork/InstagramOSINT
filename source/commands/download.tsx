import React, {useCallback} from 'react';
import zod from 'zod';
import {argument, option} from 'pastel';
import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {
	OneTurnCommand,
	outputJson,
	jsonSuccess,
	outputText,
} from '../utils/one-turn.js';
import {type InstagramClient} from '../client.js';

export const description =
	'Download media (posts, reels, stories) by media ID or username stories';

export const args = zod.tuple([
	zod.string().describe(
		argument({
			name: 'target',
			description:
				'Media ID (for posts/reels) or "stories:<username>" to download stories',
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
				description: 'Output format (json) or directory path for downloads',
			}),
		),
	dir: zod
		.string()
		.optional()
		.describe(
			option({
				alias: 'd',
				description:
					'Directory to save downloaded files (default: ./downloads)',
			}),
		),
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

async function downloadFile(url: string, filePath: string): Promise<void> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Download failed: ${response.status} ${response.statusText}`,
		);
	}

	if (!response.body) {
		throw new Error('Response body is empty');
	}

	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, {recursive: true});
	await pipeline(
		Readable.fromWeb(response.body as any),
		fs.createWriteStream(filePath),
	);
}

function getExtension(mediaType: string, url: string): string {
	if (mediaType === 'video') return '.mp4';
	if (url.includes('.jpg') || url.includes('jpeg')) return '.jpg';
	if (url.includes('.png')) return '.png';
	return '.jpg';
}

export default function Download({args: [target], options}: Properties) {
	const run = useCallback(
		async (client: InstagramClient) => {
			const isJson = options.output === 'json';
			const downloadDir = options.dir ?? './downloads';

			// Check if target is "stories:<username>"
			if (target.startsWith('stories:')) {
				const storyUsername = target.slice('stories:'.length);
				await downloadStories(client, storyUsername, downloadDir, isJson);
				return;
			}

			// Otherwise treat as media ID
			await downloadPost(client, target, downloadDir, isJson);
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

async function downloadPost(
	client: InstagramClient,
	mediaId: string,
	downloadDir: string,
	isJson: boolean,
): Promise<void> {
	let media;
	try {
		media = await client.getMediaInfo(mediaId);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		if (isJson) {
			outputJson({ok: false, error: `Media not found: ${message}`});
		} else {
			outputText(`Error: Media not found or inaccessible`);
		}

		return;
	}

	const downloaded: string[] = [];

	if (media.carouselItems && media.carouselItems.length > 0) {
		// Download all carousel items
		for (let i = 0; i < media.carouselItems.length; i++) {
			const item = media.carouselItems[i]!;
			const ext = getExtension(item.mediaType, item.url);
			const filename = `${mediaId}_${i + 1}${ext}`;
			const filePath = path.join(downloadDir, filename);

			try {
				await downloadFile(item.url, filePath);
				downloaded.push(filePath);
				if (!isJson) {
					outputText(`  Downloaded: ${filename}`);
				}
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				if (!isJson) {
					outputText(`  Failed: ${filename} — ${msg}`);
				}
			}
		}
	} else {
		// Single media
		const ext = getExtension(media.mediaType, media.url);
		const filename = `${mediaId}${ext}`;
		const filePath = path.join(downloadDir, filename);

		try {
			await downloadFile(media.url, filePath);
			downloaded.push(filePath);
			if (!isJson) {
				outputText(`  Downloaded: ${filename}`);
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			if (!isJson) {
				outputText(`  Failed: ${filename} — ${msg}`);
			}
		}
	}

	if (isJson) {
		outputJson(
			jsonSuccess({mediaId, type: media.mediaType, files: downloaded}),
		);
	} else {
		outputText(`\nDone. ${downloaded.length} file(s) saved to ${downloadDir}/`);
	}
}

async function downloadStories(
	client: InstagramClient,
	username: string,
	downloadDir: string,
	isJson: boolean,
): Promise<void> {
	let stories;
	try {
		stories = await client.getStoriesForUser(undefined, username);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		if (isJson) {
			outputJson({ok: false, error: `Stories error: ${message}`});
		} else {
			outputText(`Error: ${message}`);
		}

		return;
	}

	if (!stories || stories.length === 0) {
		if (isJson) {
			outputJson(jsonSuccess({username, files: []}));
		} else {
			outputText(`No active stories for @${username}.`);
		}

		return;
	}

	const storyDir = path.join(downloadDir, `stories_${username}`);
	const downloaded: string[] = [];

	if (!isJson) {
		outputText(`Downloading ${stories.length} stories for @${username}...`);
	}

	for (const story of stories) {
		const mediaType: 'image' | 'video' =
			(story as any).media_type === 2 ? 'video' : 'image';
		const url =
			mediaType === 'video'
				? ((story as any).video_versions?.[0]?.url ?? '')
				: ((story as any).image_versions2?.candidates?.[0]?.url ?? '');

		if (!url) continue;

		const ext = getExtension(mediaType, url);
		const filename = `${story.id}${ext}`;
		const filePath = path.join(storyDir, filename);

		try {
			await downloadFile(url, filePath);
			downloaded.push(filePath);
			if (!isJson) {
				outputText(`  Downloaded: ${filename}`);
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			if (!isJson) {
				outputText(`  Failed: ${filename} — ${msg}`);
			}
		}
	}

	if (isJson) {
		outputJson(jsonSuccess({username, files: downloaded}));
	} else {
		outputText(
			`\nDone. ${downloaded.length} story file(s) saved to ${storyDir}/`,
		);
	}
}
