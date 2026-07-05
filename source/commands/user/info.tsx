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
import {type InstagramClient} from '../../client.js';

export const description = 'Display detailed profile information for a user';

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
				description: 'Output format (json, csv)',
			}),
		),
});

type Properties = {
	readonly args: zod.infer<typeof args>;
	readonly options: zod.infer<typeof options>;
};

export default function UserInfo({args: [user], options}: Properties) {
	const run = useCallback(
		async (client: InstagramClient) => {
			const format = detectFormat(options.output);
			const isJson = format === 'json';

			let profile;
			try {
				profile = await client.getUserProfile(user);
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

			// Build structured data for formatter
			const profileData: Record<string, unknown> = {
				id: profile.pk,
				username: profile.username,
				fullName: profile.fullName,
				biography: profile.biography,
				followerCount: profile.followerCount,
				followingCount: profile.followingCount,
				mediaCount: profile.mediaCount,
				isVerified: profile.isVerified,
				isPrivate: profile.isPrivate,
				isBusiness: profile.isBusiness ?? false,
				accountType: profile.accountType ?? '',
				businessCategory: profile.businessCategory ?? '',
				externalUrl: profile.externalUrl ?? '',
			};

			// Add business-specific fields if it's a business account
			if (profile.isBusiness) {
				profileData['contactPhone'] = profile.contactPhone ?? '';
				profileData['contactEmail'] = profile.contactEmail ?? '';
			}

			if (format === 'json') {
				outputJson(jsonSuccess(profileData));
				return;
			}

			if (format === 'csv' || format === 'yaml' || format === 'markdown') {
				const output = formatOutput([profileData], {format});
				outputText(output);
				return;
			}

			// Default text output
			outputText(`@${profile.username}`);
			outputText(`  ID:              ${profile.pk}`);
			outputText(`  Full Name:       ${profile.fullName}`);
			outputText(`  Bio:             ${profile.biography}`);
			outputText(`  Followers:       ${profile.followerCount}`);
			outputText(`  Following:       ${profile.followingCount}`);
			outputText(`  Posts:           ${profile.mediaCount}`);
			outputText(`  Verified:        ${profile.isVerified ? 'Yes' : 'No'}`);
			outputText(`  Private:         ${profile.isPrivate ? 'Yes' : 'No'}`);
			outputText(`  Account Type:    ${profile.accountType ?? 'Personal'}`);

			if (profile.isBusiness) {
				outputText(`  Business:        Yes`);
				if (profile.businessCategory) {
					outputText(`  Category:        ${profile.businessCategory}`);
				}

				if (profile.contactPhone) {
					outputText(`  Phone:           ${profile.contactPhone}`);
				}

				if (profile.contactEmail) {
					outputText(`  Email:           ${profile.contactEmail}`);
				}
			} else {
				outputText(`  Business:        No`);
			}

			if (profile.externalUrl) {
				outputText(`  External URL:    ${profile.externalUrl}`);
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
