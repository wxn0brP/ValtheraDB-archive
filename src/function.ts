export function serializeFunctions(data: Record<string, any>) {
	if (!data)
		return {
			data,
			keys: [],
		};

	const functionPaths: string[][] = [];

	function serialize(obj: Record<string, any>, path: string[] = []) {
		const result: Record<string, any> = {};
		for (const [key, value] of Object.entries(obj)) {
			const nextPath = [
				...path,
				key,
			];
			if (typeof value === "function") {
				functionPaths.push(nextPath);
				result[key] = value.toString();
			} else if (
				value &&
				typeof value === "object" &&
				!Array.isArray(value) &&
				Object.getPrototypeOf(value) === Object.prototype
			) {
				result[key] = serialize(value, nextPath);
			} else {
				result[key] = value;
			}
		}
		return result;
	}

	return {
		data: serialize(data),
		keys: functionPaths,
	};
}
