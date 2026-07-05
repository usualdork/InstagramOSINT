export type SessionStatus = {
	valid: boolean;
	username?: string;
	userId?: string;
	sessionAge?: number; // seconds since login
	expiresAt?: string; // ISO date string if determinable
};

export type UserListItem = {
	pk: string;
	username: string;
	fullName: string;
	isVerified: boolean;
	isPrivate: boolean;
	profilePicUrl?: string;
	followerCount?: number;
};

export type MediaListItem = {
	id: string;
	mediaType: 'image' | 'video' | 'carousel';
	captionPreview?: string;
	timestamp: string; // ISO date
	likeCount: number;
	commentCount: number;
};

export type MediaDetail = {
	id: string;
	mediaType: 'image' | 'video' | 'carousel';
	caption?: string;
	timestamp: string;
	likeCount: number;
	commentCount: number;
	taggedUsers: string[];
	hashtags: string[];
	location?: {name: string; lat?: number; lng?: number};
	carouselItems?: Array<{mediaType: 'image' | 'video'; url: string}>;
	url: string;
};

export type EngagementMetrics = {
	username: string;
	engagementRate: number; // percentage
	averageLikes: number;
	averageComments: number;
	totalPostsAnalyzed: number;
	followerCount: number;
};

export type PostEngagement = {
	mediaId: string;
	likeCount: number;
	commentCount: number;
	engagementRate: number;
	timestamp: string;
};

export type CommentItem = {
	id: string;
	username: string;
	text: string;
	timestamp: string;
	likeCount: number;
};

export type HashtagItem = {
	name: string;
	mediaCount: number;
};

export type LocationItem = {
	id: string;
	name: string;
	address?: string;
	lat?: number;
	lng?: number;
};

export type StoryItem = {
	id: string;
	mediaType: 'image' | 'video';
	timestamp: string;
	expiresAt: string;
	url: string;
};

export type OutputFormat = 'json' | 'csv' | 'yaml' | 'markdown' | 'table';

export interface FormatterOptions {
	format: OutputFormat;
	fields?: string[];
}

export interface FilterOptions {
	limit?: number;
	offset?: number;
	sort?: string;
	desc?: boolean;
	since?: string;
	until?: string;
	contains?: string;
	verified?: boolean;
	private?: boolean;
	public?: boolean;
}

export interface PaginationOptions {
	pageSize?: number;
	all?: boolean;
	limit?: number;
	onProgress?: (fetched: number) => void;
}

export interface RateLimiterOptions {
	maxRetries?: number;
	initialBackoff?: number;
	maxBackoff?: number;
	delayBetween?: number;
}
