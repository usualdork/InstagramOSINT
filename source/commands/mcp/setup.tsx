import React, {useEffect, useState} from 'react';
import {Text, Box} from 'ink';
import {TextInput, Select} from '@inkjs/ui';
import {
	saveMcpConfig,
	getProviderDefaults,
	type McpProvider,
	type McpConfig,
} from '../../mcp/config.js';

export const description =
	'Configure MCP AI provider (Gemini, Groq, Sarvam, or custom)';

type Step = 'provider' | 'apiKey' | 'model' | 'baseUrl' | 'done';

export default function McpSetup() {
	const [step, setStep] = useState<Step>('provider');
	const [provider, setProvider] = useState<McpProvider>('gemini');
	const [apiKey, setApiKey] = useState('');
	const [model, setModel] = useState('');
	const [baseUrl, setBaseUrl] = useState('');

	useEffect(() => {
		if (step === 'done') {
			const config: McpConfig = {provider, apiKey, model, baseUrl};
			saveMcpConfig(config);
			setTimeout(() => process.exit(0), 500);
		}
	}, [step, provider, apiKey, model, baseUrl]);

	if (step === 'provider') {
		return (
			<Box flexDirection="column">
				<Text bold>Select AI Provider:</Text>
				<Select
					options={[
						{label: 'Gemini (Google)', value: 'gemini'},
						{label: 'Groq', value: 'groq'},
						{label: 'Sarvam AI', value: 'sarvam'},
						{label: 'Custom (OpenAI-compatible)', value: 'custom'},
					]}
					onChange={value => {
						const p = value as McpProvider;
						setProvider(p);
						const defaults = getProviderDefaults(p);
						setModel(defaults.model);
						setBaseUrl(defaults.baseUrl);
						setStep('apiKey');
					}}
				/>
			</Box>
		);
	}

	if (step === 'apiKey') {
		return (
			<Box flexDirection="column">
				<Text>
					Provider: <Text bold>{provider}</Text>
				</Text>
				<Text>Enter your API key:</Text>
				<TextInput
					placeholder="sk-..."
					onSubmit={value => {
						setApiKey(value);
						if (provider === 'custom') {
							setStep('baseUrl');
						} else {
							setStep('model');
						}
					}}
				/>
			</Box>
		);
	}

	if (step === 'baseUrl') {
		return (
			<Box flexDirection="column">
				<Text>Enter base URL (OpenAI-compatible endpoint):</Text>
				<TextInput
					placeholder="https://api.example.com/v1"
					onSubmit={value => {
						setBaseUrl(value);
						setStep('model');
					}}
				/>
			</Box>
		);
	}

	if (step === 'model') {
		return (
			<Box flexDirection="column">
				<Text>
					Model: <Text bold>{model}</Text>
				</Text>
				<Text>Press Enter to keep default, or type a new model name:</Text>
				<TextInput
					placeholder={model}
					onSubmit={value => {
						if (value.trim()) setModel(value.trim());
						setStep('done');
					}}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text color="green">✓ MCP configured successfully!</Text>
			<Text> Provider: {provider}</Text>
			<Text> Model: {model}</Text>
			<Text> Base URL: {baseUrl}</Text>
			<Text>
				{'\n'}Run <Text bold>igosint mcp chat</Text> to start using AI mode.
			</Text>
		</Box>
	);
}
