import React, {useEffect} from 'react';
import {Text} from 'ink';
import {startMcpChat} from '../../mcp/chat.js';

export const description =
	'Start AI-powered natural language chat for Instagram OSINT';

export default function McpChat() {
	useEffect(() => {
		void startMcpChat();
	}, []);

	return <Text> </Text>;
}
