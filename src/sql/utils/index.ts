import { VQuery } from "@wxn0brp/db-core/types/query";
import { ValtheraQuery } from "../../types";

export const COLLECTION_SRC = '`[^`]+`|"[^"]+"|[\\w/]+';
const UNSAFE_KEYS = new Set([
	"__proto__",
	"constructor",
	"prototype",
]);
const FIELD_PART_SRC = '`[^`]+`|"[^"]+"|[\\w/]+';
export const FIELD_SRC = `(?:${FIELD_PART_SRC})(?:\\.(?:${FIELD_PART_SRC}))*`;

export function parseReturn(
	method: string,
	collection: string = "",
	query: VQuery = {},
): ValtheraQuery {
	if (collection) query.collection = collection;
	return {
		method,
		query,
	};
}

export function parseSet(setString: string) {
	return Object.fromEntries(
		setString.split(/\s*,\s*/).map(pair => {
			const [key, value]: any = pair.split(/\s*=\s*/);
			let parsedValue: any = value;
			if (!Number.isNaN(+value)) parsedValue = +value;
			else parsedValue = removeQuotes(value);

			const cleanKey = removeQuotes(key);
			assertSafeFieldPath(cleanKey, "SET field");

			return [
				cleanKey,
				parsedValue,
			];
		}),
	);
}

export function removeQuotes(str: string) {
	return str.replace(/^['"`]|['"`]$/g, "");
}

/** Strip surrounding identifier quotes (backticks or double quotes). */
export function stripIdentQuotes(str: string) {
	const trimmed = str.trim();
	if (
		(trimmed.startsWith("`") && trimmed.endsWith("`")) ||
		(trimmed.startsWith('"') && trimmed.endsWith('"'))
	)
		return trimmed.slice(1, -1);
	return trimmed;
}

/** Split on a single-char separator, ignoring separators inside quotes. */
export function splitOutsideQuotes(input: string, separator: string) {
	const parts: string[] = [];
	let current = "";
	let quote: string | undefined;

	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (quote) {
			current += char;
			if (char === quote && input[i - 1] !== "\\") quote = undefined;
		} else if (char === "`" || char === '"' || char === "'") {
			quote = char;
			current += char;
		} else if (char === separator) {
			parts.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}

	parts.push(current.trim());
	return parts;
}

/** Field names core filters out as prototype pollution hazards. */
export function isUnsafeKey(key: string) {
	return UNSAFE_KEYS.has(key);
}

/** Reject field names that core would silently ignore. */
export function assertSafeFieldPath(value: string, context: string = "field") {
	const parts = splitOutsideQuotes(value.trim(), ".").map(stripIdentQuotes);
	for (const part of parts) {
		if (isUnsafeKey(part))
			throw new Error(`Unsafe ${context} '${part}' is not allowed`);
	}
}

/** Last field in a path: `users`.`id` -> id */
export function lastPathPart(value: string) {
	const parts = splitOutsideQuotes(value.trim(), ".");
	return stripIdentQuotes(parts[parts.length - 1]);
}

/** Field path without the document/collection qualifier: `users`.`id` -> id */
export function normalizeFieldPath(value: string, collection?: string) {
	const parts = splitOutsideQuotes(value.trim(), ".").map(stripIdentQuotes);
	if (
		collection &&
		parts.length > 1 &&
		parts[0] === collection &&
		parts[1] !== "*"
	)
		parts.shift();
	return parts.join(".");
}

export function parseNum(str: string) {
	return Number.isNaN(+str) ? str : +str;
}
