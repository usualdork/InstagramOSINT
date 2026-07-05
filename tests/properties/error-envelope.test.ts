import test from 'ava';
import fc from 'fast-check';
import {
	jsonError,
	formatErrorOutput,
} from '../../source/utils/error-handler.js';

// Feature: instagram-intelligence, Property 21: Error JSON Envelope

// ── Property 21: Error JSON Envelope ──────────────────────────────────────────

test('Property 21: Error JSON Envelope — jsonError returns {ok: false, error: message} for any message', t => {
	// **Validates: Requirements 22.5**
	fc.assert(
		fc.property(fc.string(), message => {
			const result = jsonError(message);

			// Result must have ok === false
			t.is(result.ok, false);

			// Result must have error equal to the input message
			t.is(result.error, message);

			// Result must only have the two expected keys
			t.deepEqual(Object.keys(result).sort(), ['error', 'ok']);
		}),
		{numRuns: 100},
	);
});

test('Property 21: Error JSON Envelope — formatErrorOutput in JSON mode produces valid JSON with {ok: false, error: message}', t => {
	// **Validates: Requirements 22.5**
	fc.assert(
		fc.property(fc.string(), message => {
			const classified = {type: 'unknown' as const, message};
			const output = formatErrorOutput(classified, true);

			// Output must be valid JSON
			let parsed: unknown;
			t.notThrows(() => {
				parsed = JSON.parse(output);
			});

			// Parsed result must conform to {ok: false, error: message}
			const envelope = parsed as {ok: boolean; error: string};
			t.is(envelope.ok, false);
			t.is(envelope.error, message);
		}),
		{numRuns: 100},
	);
});
