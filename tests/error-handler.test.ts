import test from 'ava';
import {
	classifyError,
	formatErrorOutput,
	jsonError,
	type ClassifiedError,
} from '../source/utils/error-handler.js';

// ── classifyError: Network errors ─────────────────────────────────────────────

test('classifyError: ECONNREFUSED is classified as network error', t => {
	const error = new Error('connect ECONNREFUSED 127.0.0.1:443');
	const result = classifyError(error);
	t.is(result.type, 'network');
	t.is(result.message, 'Network error: unable to reach Instagram');
	t.is(result.suggestion, 'Check your internet connection');
});

test('classifyError: ENOTFOUND is classified as network error', t => {
	const error = new Error('getaddrinfo ENOTFOUND i.instagram.com');
	const result = classifyError(error);
	t.is(result.type, 'network');
});

test('classifyError: ETIMEDOUT is classified as network error', t => {
	const error = new Error('connect ETIMEDOUT 31.13.72.174:443');
	const result = classifyError(error);
	t.is(result.type, 'network');
});

// ── classifyError: Auth expired ───────────────────────────────────────────────

test('classifyError: 401 status code is classified as auth_expired', t => {
	const error = {message: 'Unauthorized', statusCode: 401};
	const result = classifyError(error);
	t.is(result.type, 'auth_expired');
	t.is(result.message, 'Session expired');
	t.is(result.suggestion, 'Run `auth refresh` or `auth login`');
});

test('classifyError: IgLoginRequiredError name is classified as auth_expired', t => {
	const error = new Error('Login required');
	error.name = 'IgLoginRequiredError';
	const result = classifyError(error);
	t.is(result.type, 'auth_expired');
});

test('classifyError: login_required message is classified as auth_expired', t => {
	const error = new Error('login_required');
	const result = classifyError(error);
	t.is(result.type, 'auth_expired');
});

// ── classifyError: Rate limited ───────────────────────────────────────────────

test('classifyError: HTTP 429 is classified as rate_limited', t => {
	const error = {message: 'Too many requests', statusCode: 429};
	const result = classifyError(error);
	t.is(result.type, 'rate_limited');
	t.is(result.message, 'Rate limited by Instagram');
	t.is(result.suggestion, undefined);
});

test('classifyError: throttled message is classified as rate_limited', t => {
	const error = new Error('Request was throttled');
	const result = classifyError(error);
	t.is(result.type, 'rate_limited');
});

// ── classifyError: User not found ─────────────────────────────────────────────

test('classifyError: IgNotFoundError name is classified as user_not_found', t => {
	const error = new Error("User 'testuser' not found");
	error.name = 'IgNotFoundError';
	const result = classifyError(error);
	t.is(result.type, 'user_not_found');
	t.is(result.message, "User 'testuser' not found");
});

test('classifyError: 404 with user message is classified as user_not_found', t => {
	const error = {message: 'User does not exist', statusCode: 404};
	const result = classifyError(error);
	t.is(result.type, 'user_not_found');
});

test('classifyError: IgExactUserNotFoundError is classified as user_not_found', t => {
	const error = new Error('User not found');
	error.name = 'IgExactUserNotFoundError';
	const result = classifyError(error);
	t.is(result.type, 'user_not_found');
});

// ── classifyError: Private account ────────────────────────────────────────────

test('classifyError: IgPrivateUserError is classified as private_account', t => {
	const error = new Error("Account '@secretuser' is private");
	error.name = 'IgPrivateUserError';
	const result = classifyError(error);
	t.is(result.type, 'private_account');
	t.is(result.message, "Account '@secretuser' is private");
	t.is(result.suggestion, 'You must follow this account to view their data');
});

test('classifyError: private account message is classified as private_account', t => {
	const error = new Error('This is a private account');
	const result = classifyError(error);
	t.is(result.type, 'private_account');
});

// ── classifyError: Comments disabled ──────────────────────────────────────────

test('classifyError: comments disabled message is classified', t => {
	const error = new Error('Comments are disabled on this post');
	const result = classifyError(error);
	t.is(result.type, 'comments_disabled');
	t.is(result.message, 'Comments are disabled on this post');
	t.is(result.suggestion, undefined);
});

test('classifyError: CommentsDisabled error name is classified', t => {
	const error = new Error('Cannot retrieve comments');
	error.name = 'CommentsDisabledError';
	const result = classifyError(error);
	t.is(result.type, 'comments_disabled');
});

// ── classifyError: Unknown ────────────────────────────────────────────────────

test('classifyError: unrecognized error is classified as unknown', t => {
	const error = new Error('Something completely unexpected');
	const result = classifyError(error);
	t.is(result.type, 'unknown');
	t.is(result.message, 'An unexpected error occurred');
	t.is(result.suggestion, 'See log file for details');
});

test('classifyError: non-Error object is classified as unknown', t => {
	const result = classifyError({foo: 'bar'});
	t.is(result.type, 'unknown');
});

test('classifyError: string error is classified as unknown', t => {
	const result = classifyError('something went wrong');
	t.is(result.type, 'unknown');
});

// ── formatErrorOutput: text mode ──────────────────────────────────────────────

test('formatErrorOutput: text mode with suggestion', t => {
	const classified: ClassifiedError = {
		type: 'network',
		message: 'Network error: unable to reach Instagram',
		suggestion: 'Check your internet connection',
	};
	const output = formatErrorOutput(classified, false);
	t.is(
		output,
		'Error: Network error: unable to reach Instagram\nSuggestion: Check your internet connection',
	);
});

test('formatErrorOutput: text mode without suggestion', t => {
	const classified: ClassifiedError = {
		type: 'comments_disabled',
		message: 'Comments are disabled on this post',
		suggestion: undefined,
	};
	const output = formatErrorOutput(classified, false);
	t.is(output, 'Error: Comments are disabled on this post');
});

// ── formatErrorOutput: JSON mode ──────────────────────────────────────────────

test('formatErrorOutput: JSON mode outputs valid JSON envelope', t => {
	const classified: ClassifiedError = {
		type: 'auth_expired',
		message: 'Session expired',
		suggestion: 'Run `auth refresh` or `auth login`',
	};
	const output = formatErrorOutput(classified, true);
	const parsed = JSON.parse(output);
	t.deepEqual(parsed, {ok: false, error: 'Session expired'});
});

test('formatErrorOutput: JSON mode ignores suggestion', t => {
	const classified: ClassifiedError = {
		type: 'unknown',
		message: 'An unexpected error occurred',
		suggestion: 'See log file for details',
	};
	const output = formatErrorOutput(classified, true);
	const parsed = JSON.parse(output);
	t.deepEqual(parsed, {ok: false, error: 'An unexpected error occurred'});
});

// ── jsonError ─────────────────────────────────────────────────────────────────

test('jsonError: returns correct envelope structure', t => {
	const result = jsonError('Something failed');
	t.deepEqual(result, {ok: false, error: 'Something failed'});
});

test('jsonError: ok is always false', t => {
	const result = jsonError('any message');
	t.is(result.ok, false);
});

test('jsonError: preserves exact error message', t => {
	const msg = "User 'testuser' not found";
	const result = jsonError(msg);
	t.is(result.error, msg);
});
