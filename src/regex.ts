type Tree = Record<string, any>;

const LOGICAL_OPS = new Set([
	"$and",
	"$or",
	"$not",
]);

function setKey(target: Tree, key: string, value: any) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true,
	});
}

export function serializeRegex<T>(search: T): T {
	return mapSearch(search) as T;
}

function mapSearch(search: any): any {
	if (!search || typeof search !== "object" || Array.isArray(search))
		return search;

	const result: Tree = {};
	for (const key of Object.keys(search)) {
		const child = search[key];
		const op = key.toLowerCase();

		if (op === "$regex") setKey(result, key, mapPatterns(child));
		else if (LOGICAL_OPS.has(op)) setKey(result, key, mapLogical(child));
		else setKey(result, key, child);
	}
	return result;
}

function mapLogical(value: any): any {
	if (Array.isArray(value)) return value.map(mapSearch);
	if (value && typeof value === "object") return mapSearch(value);
	return value;
}

function mapPatterns(patterns: any) {
	if (!patterns || typeof patterns !== "object" || Array.isArray(patterns))
		return patterns;

	const result: Tree = {};
	for (const field of Object.keys(patterns)) {
		const pattern = patterns[field];
		setKey(
			result,
			field,
			pattern instanceof RegExp
				? {
						source: pattern.source,
						flags: pattern.flags,
					}
				: mapPatterns(pattern),
		);
	}
	return result;
}
