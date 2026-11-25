export interface SerializedRegExp {
	source: string;
	flags?: string;
}

export function isSerializedRegExp(value: unknown): value is SerializedRegExp {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;

	const record = value as Record<string, unknown>;
	for (const key of Object.keys(record))
		if (key !== "source" && key !== "flags") return false;

	return (
		typeof record.source === "string" &&
		(record.flags === undefined || typeof record.flags === "string")
	);
}

function reviveRegexValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reviveRegexValue);
	if (isSerializedRegExp(value)) return new RegExp(value.source, value.flags);
	return value;
}

export function deserializeRegex<T>(node: T): T {
	if (!node || typeof node !== "object") return node;

	if (Array.isArray(node)) {
		for (const item of node) deserializeRegex(item);
		return node;
	}

	for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
		if (key.toLowerCase() === "$regex") {
			if (!value || typeof value !== "object" || Array.isArray(value)) continue;

			for (const field of Object.keys(value as Record<string, unknown>)) {
				const record = value as Record<string, unknown>;
				record[field] = reviveRegexValue(record[field]);
			}
			continue;
		}

		deserializeRegex(value);
	}

	return node;
}
