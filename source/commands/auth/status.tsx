import React, {useCallback} from 'react';
import zod from 'zod';
import {option} from 'pastel';
import {
	OneTurnCommand,
	outputJson,
	jsonSuccess,
	outputText,
} from '../../utils/one-turn.js';
import {type InstagramClient} from '../../client.js';

export const description = 'Check current session validity and details';

export const options = zod.object({
	username: zod
		.string()
		.optional()
		.describe(
			option({
				alias: 'u',
				description: 'Account username to use',
			}),
		),
	output: zod
		.string()
		.optional()
		.describe(
			option({
				alias: 'o',
				description: 'Output format (json)',
			}),
		),
});

type Properties = {
	readonly options: zod.infer<typeof options>;
};

function formatDuration(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);

	return parts.length > 0 ? parts.join(' ') : '<1m';
}

export default function Status({options}: Properties) {
	const run = useCallback(
		async (client: InstagramClient) => {
			const isJson = options.output === 'json';
			const status = await client.getSessionStatus();

			if (isJson) {
				outputJson(
					jsonSuccess({
						valid: status.valid,
						username: status.username ?? null,
						userId: status.userId ?? null,
						sessionAge: status.sessionAge ?? null,
						expiresAt: status.expiresAt ?? null,
					}),
				);
				return;
			}

			if (!status.valid) {
				if (status.username) {
					outputText('Session expired.');
					outputText(
						'Suggestion: Run `auth refresh` or `auth login` to re-authenticate.',
					);
				} else {
					outputText('No active session found.');
					outputText('Suggestion: Run `auth login` to authenticate.');
				}

				return;
			}

			outputText(`Session valid`);
			outputText(`  Username: @${status.username}`);
			if (status.userId) {
				outputText(`  User ID:  ${status.userId}`);
			}

			if (status.sessionAge !== undefined) {
				outputText(`  Age:      ${formatDuration(status.sessionAge)}`);
			}

			if (status.expiresAt) {
				outputText(`  Expires:  ${status.expiresAt}`);
			}
		},
		[options],
	);

	return (
		<OneTurnCommand
			username={options.username}
			output={options.output}
			run={run}
		/>
	);
}
