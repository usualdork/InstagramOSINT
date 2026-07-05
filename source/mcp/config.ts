import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';

export type McpProvider = 'gemini' | 'groq' | 'sarvam' | 'custom';

export interface McpConfig {
	provider: McpProvider;
	apiKey: string;
	model: string;
	baseUrl: string;
}

const CONFIG_PATH = path.join(os.homedir(), '.igosint', 'mcp-config.yaml');

const PROVIDER_DEFAULTS: Record<McpProvider, {baseUrl: string; model: string}> =
	{
		gemini: {
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
			model: 'gemini-2.5-flash',
		},
		groq: {
			baseUrl: 'https://api.groq.com/openai/v1',
			model: 'openai/gpt-oss-120b',
		},
		sarvam: {
			baseUrl: 'https://api.sarvam.ai/v1',
			model: 'sarvam-105b',
		},
		custom: {
			baseUrl: '',
			model: '',
		},
	};

export function getProviderDefaults(provider: McpProvider) {
	return PROVIDER_DEFAULTS[provider];
}

export function loadMcpConfig(): McpConfig | undefined {
	try {
		if (!fs.existsSync(CONFIG_PATH)) {
			return undefined;
		}

		const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
		return yaml.load(raw) as McpConfig;
	} catch {
		return undefined;
	}
}

export function saveMcpConfig(config: McpConfig): void {
	const dir = path.dirname(CONFIG_PATH);
	fs.mkdirSync(dir, {recursive: true});
	fs.writeFileSync(CONFIG_PATH, yaml.dump(config), 'utf8');
}

export function getMcpConfigPath(): string {
	return CONFIG_PATH;
}
