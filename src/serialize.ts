export interface CrdtRegexMarker {
	$vcrdtRegex: {
		source: string;
		flags: string;
	};
}

function isPlainObject(value: unknown): value is Record<string, any> {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

function isRegexMarker(value: unknown): value is CrdtRegexMarker {
	if (!isPlainObject(value) || Object.keys(value).length !== 1) return false;
	if (!Object.hasOwn(value, "$vcrdtRegex")) return false;
	const marker = value.$vcrdtRegex;
	return (
		isPlainObject(marker) &&
		typeof marker.source === "string" &&
		typeof marker.flags === "string"
	);
}

export function encodeCrdt<T>(value: T): T {
	if (value instanceof RegExp) {
		return {
			$vcrdtRegex: {
				source: value.source,
				flags: value.flags,
			},
		} as T;
	}

	if (Array.isArray(value)) return value.map(item => encodeCrdt(item)) as T;

	if (isPlainObject(value)) {
		const result: Record<string, any> = {};
		for (const [key, child] of Object.entries(value))
			result[key] = encodeCrdt(child);
		return result as T;
	}

	return value;
}

export function decodeCrdt<T>(value: T): T {
	if (isRegexMarker(value))
		return new RegExp(value.$vcrdtRegex.source, value.$vcrdtRegex.flags) as T;

	if (Array.isArray(value)) return value.map(item => decodeCrdt(item)) as T;

	if (isPlainObject(value)) {
		const result: Record<string, any> = {};
		for (const [key, child] of Object.entries(value))
			result[key] = decodeCrdt(child);
		return result as T;
	}

	return value;
}
