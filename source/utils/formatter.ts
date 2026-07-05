import yaml from 'js-yaml';
import stringWidth from 'string-width';
import type {OutputFormat, FormatterOptions} from '../types/intelligence.js';

/**
 * Formats an array of data records into the specified output format.
 */
export function formatOutput(
	data: Record<string, unknown>[],
	options: FormatterOptions,
): string {
	if (data.length === 0) {
		return formatEmpty(options.format);
	}

	const filtered = options.fields
		? data.map(row => pickFields(row, options.fields!))
		: data;

	switch (options.format) {
		case 'json': {
			return formatJson(filtered);
		}

		case 'csv': {
			return formatCsv(filtered);
		}

		case 'yaml': {
			return formatYaml(filtered);
		}

		case 'markdown': {
			return formatMarkdown(filtered);
		}

		case 'table': {
			return formatTable(filtered);
		}
	}
}

/**
 * Resolves an OutputFormat from the CLI flag value.
 * Defaults to 'table' if no flag is provided or the value is unrecognized.
 */
export function detectFormat(outputFlag?: string): OutputFormat {
	if (!outputFlag) {
		return 'table';
	}

	const normalized = outputFlag.toLowerCase().trim();
	const validFormats: OutputFormat[] = [
		'json',
		'csv',
		'yaml',
		'markdown',
		'table',
	];

	if (validFormats.includes(normalized as OutputFormat)) {
		return normalized as OutputFormat;
	}

	return 'table';
}

function pickFields(
	row: Record<string, unknown>,
	fields: string[],
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const field of fields) {
		if (field in row) {
			result[field] = row[field];
		}
	}

	return result;
}

function formatEmpty(format: OutputFormat): string {
	switch (format) {
		case 'json': {
			return '[]';
		}

		case 'csv': {
			return '';
		}

		case 'yaml': {
			return '[]\n';
		}

		case 'markdown': {
			return '';
		}

		case 'table': {
			return '';
		}
	}
}

function formatJson(data: Record<string, unknown>[]): string {
	return JSON.stringify(data, null, 2);
}

function formatCsv(data: Record<string, unknown>[]): string {
	const headers = Object.keys(data[0]!);
	const headerRow = headers.map(h => escapeCsvField(String(h))).join(',');

	const rows = data.map(row =>
		headers.map(h => escapeCsvField(stringifyValue(row[h]))).join(','),
	);

	return [headerRow, ...rows].join('\n');
}

/**
 * Escapes a CSV field according to RFC 4180:
 * - Fields containing commas, double quotes, or newlines are enclosed in double quotes
 * - Double quotes within fields are escaped by doubling them
 */
function escapeCsvField(value: string): string {
	if (
		value.includes(',') ||
		value.includes('"') ||
		value.includes('\n') ||
		value.includes('\r')
	) {
		return `"${value.replaceAll('"', '""')}"`;
	}

	return value;
}

function formatYaml(data: Record<string, unknown>[]): string {
	return yaml.dump(data, {lineWidth: -1, noRefs: true});
}

function formatMarkdown(data: Record<string, unknown>[]): string {
	const headers = Object.keys(data[0]!);

	const headerRow = `| ${headers.join(' | ')} |`;
	const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;

	const dataRows = data.map(
		row =>
			`| ${headers.map(h => escapeMarkdownCell(stringifyValue(row[h]))).join(' | ')} |`,
	);

	return [headerRow, separatorRow, ...dataRows].join('\n');
}

function escapeMarkdownCell(value: string): string {
	return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function formatTable(data: Record<string, unknown>[]): string {
	const headers = Object.keys(data[0]!);

	// Calculate column widths based on headers and data
	const colWidths = headers.map(h => {
		const headerWidth = stringWidth(h);
		const maxDataWidth = data.reduce((max, row) => {
			const cellWidth = stringWidth(stringifyValue(row[h]));
			return Math.max(max, cellWidth);
		}, 0);
		return Math.max(headerWidth, maxDataWidth);
	});

	// Build header line
	const headerLine = headers
		.map((h, i) => padRight(h, colWidths[i]!))
		.join('  ');

	// Build separator
	const separator = colWidths.map(w => '─'.repeat(w)).join('──');

	// Build data rows
	const dataRows = data.map(row =>
		headers
			.map((h, i) => padRight(stringifyValue(row[h]), colWidths[i]!))
			.join('  '),
	);

	return [headerLine, separator, ...dataRows].join('\n');
}

function padRight(str: string, width: number): string {
	const currentWidth = stringWidth(str);
	if (currentWidth >= width) {
		return str;
	}

	return str + ' '.repeat(width - currentWidth);
}

function stringifyValue(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	if (typeof value === 'object') {
		return JSON.stringify(value);
	}

	return String(value);
}
