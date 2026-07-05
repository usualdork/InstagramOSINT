import React, {useCallback} from 'react';
import zod from 'zod';
import {option} from 'pastel';
import {
	OneTurnCommand,
	outputJson,
	jsonSuccess,
	jsonError,
	outputText,
} from '../../utils/one-turn.js';
import {type InstagramClient} from '../../client.js';

export const description =
	'Refresh the current session without re-entering credentials';

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

export default function Refresh({options}: Properties) {
	const run = useCallback(
		async (client: InstagramClient) => {
			const isJson = options.output === 'json';
			const status = await client.refreshSession();

			if (isJson) {
				if (status.valid) {
					outputJson(
						jsonSuccess({
							refreshed: true,
							username: status.username ?? null,
							userId: status.userId ?? null,
							sessionAge: status.sessionAge ?? null,
							expiresAt: status.expiresAt ?? null,
						}),
					);
				} else {
					outputJson(
						jsonError(
							'Session refresh failed. Please run `auth login` to re-authenticate.',
						),
					);
				}

				return;
			}

			if (status.valid) {
				outputText(`Session refreshed successfully`);
				outputText(`  Username: @${status.username}`);
				if (status.userId) {
					outputText(`  User ID:  ${status.userId}`);
				}

				return;
			}

			outputText('Error: Session refresh failed.');
			outputText('Suggestion: Run `auth login` to re-authenticate.');
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
