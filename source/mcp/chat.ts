import OpenAI from 'openai';
import type {ChatCompletionMessageParam} from 'openai/resources/chat/completions';
import {loadMcpConfig} from './config.js';
import {TOOLS} from './tools.js';
import {executeTool} from './executor.js';
import readline from 'node:readline';

const SYSTEM_PROMPT = `You are Instagram OSINT — an AI intelligence assistant for Instagram analysis.
You have access to tools that can fetch Instagram data: user profiles, followers, following lists, media posts, engagement metrics, comments, stories, search, and more.
You can also download media and export data to files.

When the user asks for information, use the appropriate tools to fetch it. Combine multiple tool calls when needed.
When the user mentions file paths, directories, or filenames, pass them to the tools' output_dir or output_file parameters.
If the user says "desktop", translate that to ~/Desktop. If they mention a folder name, create the full path.
Always be concise and present data clearly.`;

export async function startMcpChat(): Promise<void> {
	const config = loadMcpConfig();
	if (!config) {
		console.error('MCP not configured. Run `igosint mcp setup` first.');
		process.exit(1);
	}

	const openai = new OpenAI({
		apiKey: config.apiKey,
		baseURL: config.baseUrl,
	});

	const messages: ChatCompletionMessageParam[] = [
		{role: 'system', content: SYSTEM_PROMPT},
	];

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	console.log(`\n🔍 Instagram OSINT — AI Chat Mode`);
	console.log(`   Provider: ${config.provider} | Model: ${config.model}`);
	console.log(
		`   Type your request in natural language. Type "exit" to quit.\n`,
	);

	const prompt = (): Promise<string> =>
		new Promise(resolve => {
			rl.question('You: ', answer => resolve(answer));
		});

	while (true) {
		const input = await prompt();

		if (!input.trim()) continue;
		if (input.trim().toLowerCase() === 'exit') {
			console.log('Goodbye.');
			rl.close();
			process.exit(0);
		}

		messages.push({role: 'user', content: input});

		try {
			let response = await openai.chat.completions.create({
				model: config.model,
				messages,
				tools: TOOLS,
				tool_choice: 'auto',
			});

			let message = response.choices[0]?.message;
			if (!message) {
				console.log('AI: No response received.');
				continue;
			}

			// Tool call loop — keep calling tools until the model returns text
			while (message.tool_calls && message.tool_calls.length > 0) {
				messages.push(message);

				// Execute each tool call
				for (const toolCall of message.tool_calls) {
					const fnName = (toolCall as any).function.name as string;
					const fnArgs = JSON.parse(
						(toolCall as any).function.arguments as string,
					) as Record<string, unknown>;

					console.log(`  ⚡ Calling ${fnName}...`);
					const result = await executeTool(fnName, fnArgs);

					messages.push({
						role: 'tool',
						tool_call_id: toolCall.id,
						content: result,
					});
				}

				// Get next response from model
				response = await openai.chat.completions.create({
					model: config.model,
					messages,
					tools: TOOLS,
					tool_choice: 'auto',
				});

				message = response.choices[0]?.message;
				if (!message) break;
			}

			if (message?.content) {
				messages.push({role: 'assistant', content: message.content});
				console.log(`\nAI: ${message.content}\n`);
			}
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`\nError: ${msg}\n`);
			// Remove the failed user message to keep conversation valid
			messages.pop();
		}
	}
}
