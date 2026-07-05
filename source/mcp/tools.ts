import type {ChatCompletionTool} from 'openai/resources/chat/completions';

export const TOOLS: ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'get_user_info',
			description:
				'Get detailed profile information for an Instagram user including follower count, bio, verification status, etc.',
			parameters: {
				type: 'object',
				properties: {
					username: {
						type: 'string',
						description: 'Instagram username (without @)',
					},
				},
				required: ['username'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_followers',
			description: 'Get the list of followers for an Instagram user',
			parameters: {
				type: 'object',
				properties: {
					username: {type: 'string', description: 'Instagram username'},
					limit: {
						type: 'number',
						description: 'Maximum number of followers to return (default: 20)',
					},
				},
				required: ['username'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_following',
			description: 'Get the list of accounts a user is following',
			parameters: {
				type: 'object',
				properties: {
					username: {type: 'string', description: 'Instagram username'},
					limit: {
						type: 'number',
						description: 'Maximum number of following to return (default: 20)',
					},
				},
				required: ['username'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_media',
			description:
				'Get a list of media posts (photos, videos, reels) for a user',
			parameters: {
				type: 'object',
				properties: {
					username: {type: 'string', description: 'Instagram username'},
					limit: {
						type: 'number',
						description: 'Maximum number of posts to return (default: 12)',
					},
				},
				required: ['username'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_media_info',
			description:
				'Get detailed information about a specific media post including caption, hashtags, tagged users, location',
			parameters: {
				type: 'object',
				properties: {
					media_id: {type: 'string', description: 'The media ID of the post'},
				},
				required: ['media_id'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_engagement',
			description:
				'Calculate engagement metrics (engagement rate, avg likes, avg comments) for a user',
			parameters: {
				type: 'object',
				properties: {
					username: {type: 'string', description: 'Instagram username'},
					limit: {
						type: 'number',
						description: 'Number of recent posts to analyze (default: 20)',
					},
				},
				required: ['username'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_comments',
			description: 'Get comments on a specific media post',
			parameters: {
				type: 'object',
				properties: {
					media_id: {type: 'string', description: 'The media ID of the post'},
					limit: {
						type: 'number',
						description: 'Maximum number of comments to return (default: 20)',
					},
				},
				required: ['media_id'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_stories',
			description: 'Get active stories for a user',
			parameters: {
				type: 'object',
				properties: {
					username: {type: 'string', description: 'Instagram username'},
				},
				required: ['username'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_users',
			description: 'Search for Instagram users by query',
			parameters: {
				type: 'object',
				properties: {
					query: {type: 'string', description: 'Search query'},
					limit: {type: 'number', description: 'Maximum results (default: 10)'},
				},
				required: ['query'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_hashtags',
			description: 'Search for hashtags by query',
			parameters: {
				type: 'object',
				properties: {
					query: {type: 'string', description: 'Search query'},
					limit: {type: 'number', description: 'Maximum results (default: 10)'},
				},
				required: ['query'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_locations',
			description: 'Search for locations by query',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Search query (city, place name)',
					},
					limit: {type: 'number', description: 'Maximum results (default: 10)'},
				},
				required: ['query'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_mutual_connections',
			description:
				'Find mutual connections (accounts both users follow) between two users',
			parameters: {
				type: 'object',
				properties: {
					user1: {type: 'string', description: 'First Instagram username'},
					user2: {type: 'string', description: 'Second Instagram username'},
				},
				required: ['user1', 'user2'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'download_media',
			description:
				'Download media (posts, reels, carousel images) to a local directory',
			parameters: {
				type: 'object',
				properties: {
					media_id: {type: 'string', description: 'Media ID to download'},
					output_dir: {
						type: 'string',
						description: 'Directory to save files (default: ./downloads)',
					},
				},
				required: ['media_id'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'download_stories',
			description:
				'Download all active stories for a user to a local directory',
			parameters: {
				type: 'object',
				properties: {
					username: {type: 'string', description: 'Instagram username'},
					output_dir: {
						type: 'string',
						description: 'Directory to save files (default: ./downloads)',
					},
				},
				required: ['username'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'export_data',
			description:
				'Export followers, following, or media data to a file (CSV, JSON, or YAML)',
			parameters: {
				type: 'object',
				properties: {
					type: {
						type: 'string',
						enum: ['followers', 'following', 'media'],
						description: 'Type of data to export',
					},
					username: {type: 'string', description: 'Instagram username'},
					format: {
						type: 'string',
						enum: ['csv', 'json', 'yaml'],
						description: 'Output file format (default: json)',
					},
					output_file: {
						type: 'string',
						description:
							'Output file path (e.g. ~/Desktop/osint/followers.csv)',
					},
					limit: {
						type: 'number',
						description: 'Maximum items to export (omit for all)',
					},
					fields: {
						type: 'string',
						description:
							'Comma-separated fields to include (e.g. username,fullName,isVerified)',
					},
				},
				required: ['type', 'username'],
			},
		},
	},
];
