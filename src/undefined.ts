function isPlainObject(value: unknown): value is Record<string, any> {
	return (
		!!value &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

export function findUndefinedPaths(data: Record<string, any>): string[][] {
	const updater = data?.updater;
	if (!isPlainObject(updater)) return [];

	const undefinedPaths: string[][] = [];

	function walk(obj: Record<string, any>, path: string[]) {
		for (const [key, value] of Object.entries(obj)) {
			const nextPath = [
				...path,
				key,
			];
			if (value === undefined) undefinedPaths.push(nextPath);
			else if (isPlainObject(value)) walk(value, nextPath);
		}
	}

	walk(updater, [
		"updater",
	]);
	return undefinedPaths;
}
