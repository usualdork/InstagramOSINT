import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {InstagramClient} from '../client.js';
import {ConfigManager} from '../config.js';
import {SessionManager} from '../session.js';
import {paginate} from '../utils/pagination-handler.js';
import {formatOutput} from '../utils/formatter.js';
import type {OutputFormat} from '../types/intelligence.js';

let cachedClient: InstagramClient | undefined;

export async function getClient(): Promise<InstagramClient> {
	if (cachedClient) return cachedClient;

	const config = ConfigManager.getInstance();
	const username =
		config.get('login.currentUsername') ?? config.get('login.defaultUsername');

	if (!username) {
		throw new Error(
			'No Instagram session found. Run `igosint auth login` first.',
		);
	}

	const sessionManager = new SessionManager(username);
	const exists = await sessionManager.sessionExists();
	if (!exists) {
		throw new Error(
			`No session for ${username}. Run \`igosint auth login\` first.`,
		);
	}

	const client = new InstagramClient(username);
	const result = await client.loginBySession({initializeRealtime: false});
	if (!result.success) {
		throw new Error(`Session login failed: ${result.error ?? 'unknown'}`);
	}

	cachedClient = client;
	return client;
}

export async function executeTool(
	name: string,
	args: Record<string, unknown>,
): Promise<string> {
	try {
		const result = await executeToolInternal(name, args);
		return JSON.stringify(result, null, 2);
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : String(error);
		return JSON.stringify({error: msg});
	}
}

async function executeToolInternal(
	name: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const client = await getClient();

	switch (name) {
		case 'get_user_info': {
			const profile = await client.getUserProfile(args['username'] as string);
			return profile;
		}

		case 'get_followers': {
			const profile = await client.getUserProfile(args['username'] as string);
			const limit = (args['limit'] as number) ?? 20;
			const fetchPage = async (cursor?: string) => {
				const r = await client.getFollowers(profile.pk, cursor);
				return {items: r.users, nextCursor: r.nextCursor};
			};

			return paginate(fetchPage, {limit, onProgress() {}});
		}

		case 'get_following': {
			const profile = await client.getUserProfile(args['username'] as string);
			const limit = (args['limit'] as number) ?? 20;
			const fetchPage = async (cursor?: string) => {
				const r = await client.getFollowing(profile.pk, cursor);
				return {items: r.users, nextCursor: r.nextCursor};
			};

			return paginate(fetchPage, {limit, onProgress() {}});
		}

		case 'get_media': {
			const profile = await client.getUserProfile(args['username'] as string);
			const limit = (args['limit'] as number) ?? 12;
			const fetchPage = async (cursor?: string) => {
				const r = await client.getUserMedia(profile.pk, cursor);
				return {items: r.items, nextCursor: r.nextCursor};
			};

			return paginate(fetchPage, {limit, onProgress() {}});
		}

		case 'get_media_info': {
			return client.getMediaInfo(args['media_id'] as string);
		}

		case 'get_engagement': {
			const username = args['username'] as string;
			const limit = (args['limit'] as number) ?? 20;
			const profile = await client.getUserProfile(username);
			const fetchPage = async (cursor?: string) => {
				const r = await client.getUserMedia(profile.pk, cursor);
				return {items: r.items, nextCursor: r.nextCursor};
			};

			const media = await paginate(fetchPage, {limit, onProgress() {}});
			if (media.length === 0) return {error: 'No media found'};

			const totalLikes = media.reduce((s, p) => s + p.likeCount, 0);
			const totalComments = media.reduce((s, p) => s + p.commentCount, 0);
			const avgLikes = totalLikes / media.length;
			const avgComments = totalComments / media.length;
			const rate =
				profile.followerCount > 0
					? ((avgLikes + avgComments) / profile.followerCount) * 100
					: 0;

			return {
				username,
				engagementRate: Math.round(rate * 100) / 100,
				averageLikes: Math.round(avgLikes * 100) / 100,
				averageComments: Math.round(avgComments * 100) / 100,
				totalPostsAnalyzed: media.length,
				followerCount: profile.followerCount,
			};
		}

		case 'get_comments': {
			const mediaId = args['media_id'] as string;
			const limit = (args['limit'] as number) ?? 20;
			const fetchPage = async (cursor?: string) => {
				const r = await client.getMediaComments(mediaId, cursor);
				return {items: r.comments, nextCursor: r.nextCursor};
			};

			return paginate(fetchPage, {limit, onProgress() {}});
		}

		case 'get_stories': {
			const stories = await client.getStoriesForUser(
				undefined,
				args['username'] as string,
			);
			if (!stories || stories.length === 0) return [];
			return stories.map((s: any) => ({
				id: s.id,
				mediaType: s.media_type === 2 ? 'video' : 'image',
				timestamp: new Date(s.taken_at * 1000).toISOString(),
				expiresAt: new Date(s.taken_at * 1000 + 86400000).toISOString(),
			}));
		}

		case 'search_users': {
			const results = await client.searchUsers(args['query'] as string);
			const limit = (args['limit'] as number) ?? 10;
			return results.slice(0, limit);
		}

		case 'search_hashtags': {
			const results = await client.searchHashtags(args['query'] as string);
			const limit = (args['limit'] as number) ?? 10;
			return results.slice(0, limit);
		}

		case 'search_locations': {
			const results = await client.searchLocations(args['query'] as string);
			const limit = (args['limit'] as number) ?? 10;
			return results.slice(0, limit);
		}

		case 'get_mutual_connections': {
			const p1 = await client.getUserProfile(args['user1'] as string);
			const p2 = await client.getUserProfile(args['user2'] as string);

			const fetch1 = async (cursor?: string) => {
				const r = await client.getFollowing(p1.pk, cursor);
				return {items: r.users, nextCursor: r.nextCursor};
			};

			const fetch2 = async (cursor?: string) => {
				const r = await client.getFollowing(p2.pk, cursor);
				return {items: r.users, nextCursor: r.nextCursor};
			};

			const [f1, f2] = await Promise.all([
				paginate(fetch1, {all: true, onProgress() {}}),
				paginate(fetch2, {all: true, onProgress() {}}),
			]);

			const set2 = new Set(f2.map(u => u.pk));
			const mutual = f1.filter(u => set2.has(u.pk));
			return {count: mutual.length, mutual};
		}

		case 'download_media': {
			const mediaId = args['media_id'] as string;
			const dir = resolveDir(
				args['output_dir'] as string | undefined,
				'./downloads',
			);
			const media = await client.getMediaInfo(mediaId);
			const downloaded: string[] = [];

			if (media.carouselItems && media.carouselItems.length > 0) {
				for (let i = 0; i < media.carouselItems.length; i++) {
					const item = media.carouselItems[i]!;
					const ext = item.mediaType === 'video' ? '.mp4' : '.jpg';
					const fp = path.join(dir, `${mediaId}_${i + 1}${ext}`);
					await downloadFile(item.url, fp);
					downloaded.push(fp);
				}
			} else {
				const ext = media.mediaType === 'video' ? '.mp4' : '.jpg';
				const fp = path.join(dir, `${mediaId}${ext}`);
				await downloadFile(media.url, fp);
				downloaded.push(fp);
			}

			return {downloaded, directory: dir};
		}

		case 'download_stories': {
			const username = args['username'] as string;
			const dir = resolveDir(
				args['output_dir'] as string | undefined,
				`./downloads/stories_${username}`,
			);
			const stories = await client.getStoriesForUser(undefined, username);
			if (!stories || stories.length === 0)
				return {downloaded: [], message: 'No active stories'};

			const downloaded: string[] = [];
			for (const story of stories) {
				const mediaType = (story as any).media_type === 2 ? 'video' : 'image';
				const url =
					mediaType === 'video'
						? ((story as any).video_versions?.[0]?.url ?? '')
						: ((story as any).image_versions2?.candidates?.[0]?.url ?? '');
				if (!url) continue;
				const ext = mediaType === 'video' ? '.mp4' : '.jpg';
				const fp = path.join(dir, `${story.id}${ext}`);
				await downloadFile(url, fp);
				downloaded.push(fp);
			}

			return {downloaded, directory: dir};
		}

		case 'export_data': {
			const type = args['type'] as string;
			const username = args['username'] as string;
			const format = (args['format'] as OutputFormat) ?? 'json';
			const limit = args['limit'] as number | undefined;
			const fields = args['fields'] as string | undefined;
			const outputFile = args['output_file'] as string | undefined;

			const profile = await client.getUserProfile(username);
			let data: Record<string, unknown>[];

			if (type === 'followers') {
				const fetchPage = async (cursor?: string) => {
					const r = await client.getFollowers(profile.pk, cursor);
					return {items: r.users, nextCursor: r.nextCursor};
				};

				const items = await paginate(fetchPage, {
					all: !limit,
					limit,
					onProgress() {},
				});
				data = items as unknown as Record<string, unknown>[];
			} else if (type === 'following') {
				const fetchPage = async (cursor?: string) => {
					const r = await client.getFollowing(profile.pk, cursor);
					return {items: r.users, nextCursor: r.nextCursor};
				};

				const items = await paginate(fetchPage, {
					all: !limit,
					limit,
					onProgress() {},
				});
				data = items as unknown as Record<string, unknown>[];
			} else {
				const fetchPage = async (cursor?: string) => {
					const r = await client.getUserMedia(profile.pk, cursor);
					return {items: r.items, nextCursor: r.nextCursor};
				};

				const items = await paginate(fetchPage, {
					all: !limit,
					limit,
					onProgress() {},
				});
				data = items as unknown as Record<string, unknown>[];
			}

			const fieldsList = fields?.split(',').map(f => f.trim());
			const formatted = formatOutput(data, {format, fields: fieldsList});

			const ext = format === 'yaml' ? 'yaml' : format;
			const filePath =
				resolveDir(outputFile, undefined) ?? `${type}_${username}.${ext}`;
			const dir = path.dirname(filePath);
			if (dir !== '.') fs.mkdirSync(dir, {recursive: true});
			fs.writeFileSync(filePath, formatted, 'utf8');

			return {file: filePath, count: data.length, format};
		}

		default:
			return {error: `Unknown tool: ${name}`};
	}
}

function resolveDir(
	input: string | undefined,
	fallback: string | undefined,
): string {
	if (!input) return fallback ?? '.';
	// Expand ~ to home directory
	if (input.startsWith('~')) {
		const homedir = process.env['HOME'] ?? '/tmp';
		return path.join(homedir, input.slice(1));
	}

	return input;
}

async function downloadFile(url: string, filePath: string): Promise<void> {
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, {recursive: true});
	const response = await fetch(url);
	if (!response.ok || !response.body)
		throw new Error(`Download failed: ${response.status}`);
	await pipeline(
		Readable.fromWeb(response.body as any),
		fs.createWriteStream(filePath),
	);
}
