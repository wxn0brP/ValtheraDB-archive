import {
	assertSafeFieldPath,
	parseNum,
	parseReturn,
	parseSet,
	removeQuotes,
} from "#sql/utils";

export function handleInsert(query: string) {
	const match = query.match(
		/INSERT INTO\s+((?:`[^`]+`|"[^"]+"|\w+(?:\.\w+)*))\s*\(\s*([^)]+)\s*\)\s*VALUES\s*(.+)$/i,
	);
	if (!match) throw new Error("Invalid INSERT syntax");
	const collection = removeQuotes(match[1]);
	const keys = match[2].split(/\s*,\s*/);
	for (const key of keys)
		assertSafeFieldPath(removeQuotes(key), "INSERT column");
	let rest = match[3].trim();

	let onDuplicateUpdate: string | null = null;
	let onDuplicateDelete = false;
	const dupMatch = rest.match(
		/\s+ON\s+DUPLICATE\s+KEY\s+(UPDATE\s+.+|DELETE)\s*$/i,
	);
	if (dupMatch) {
		const dupPart = dupMatch[1].trim();
		rest = rest.substring(0, dupMatch.index).trim();
		if (/^UPDATE\s+/i.test(dupPart)) {
			onDuplicateUpdate = dupPart.replace(/^UPDATE\s+/i, "").trim();
		} else if (/^DELETE$/i.test(dupPart)) {
			onDuplicateDelete = true;
		} else {
			throw new Error("Invalid ON DUPLICATE KEY clause");
		}
	}

	const tuples = parseValueTuples(rest);
	for (const values of tuples) {
		if (keys.length !== values.length)
			throw new Error("Number of columns and values does not match");
	}

	const makeData = (values: string[]) =>
		Object.fromEntries(
			keys.map((k, i) => [
				removeQuotes(k),
				parseNum(values[i]),
			]),
		);

	if (onDuplicateUpdate !== null) {
		if (tuples.length !== 1)
			throw new Error("ON DUPLICATE KEY requires exactly one row");
		const data = makeData(tuples[0]);
		return parseReturn("updateOneOrAdd", collection, {
			search: data,
			updater: parseSet(onDuplicateUpdate),
			add_arg: data,
		});
	}

	if (onDuplicateDelete) {
		if (tuples.length !== 1)
			throw new Error("ON DUPLICATE KEY requires exactly one row");
		const data = makeData(tuples[0]);
		return parseReturn("toggleOne", collection, {
			search: data,
			data,
		});
	}

	if (tuples.length === 1) {
		return parseReturn("add", collection, {
			data: makeData(tuples[0]),
		});
	}

	return parseReturn("bulkAdd", collection, {
		datas: tuples.map(makeData),
	});
}

function parseValueTuples(str: string): string[][] {
	const tuples: string[][] = [];
	let depth = 0;
	let inSingle = false;
	let inDouble = false;
	let current = "";

	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		if (char === "'" && !inDouble) {
			inSingle = !inSingle;
			current += char;
		} else if (char === '"' && !inSingle) {
			inDouble = !inDouble;
			current += char;
		} else if (!inSingle && !inDouble) {
			if (char === "(") {
				depth++;
				current += char;
			} else if (char === ")") {
				depth--;
				current += char;
			} else if (char === "," && depth === 0) {
				tuples.push(parseTuple(current));
				current = "";
			} else {
				current += char;
			}
		} else {
			current += char;
		}
	}
	if (current.trim()) tuples.push(parseTuple(current));
	return tuples;
}

function parseTuple(str: string) {
	const inner = str.trim().replace(/^\(/, "").replace(/\)$/, "");
	const tokens: string[] = [];
	let current = "";
	let inSingle = false;
	let inDouble = false;

	for (let i = 0; i < inner.length; i++) {
		const char = inner[i];
		if (char === "'" && !inDouble) {
			inSingle = !inSingle;
			current += char;
		} else if (char === '"' && !inSingle) {
			inDouble = !inDouble;
			current += char;
		} else if (char === "," && !inSingle && !inDouble) {
			tokens.push(current);
			current = "";
		} else {
			current += char;
		}
	}
	tokens.push(current);

	return tokens.map(v => {
		v = v.trim();
		if (v.length >= 2) {
			if (v[0] === "'" && v[v.length - 1] === "'") {
				v = v.substring(1, v.length - 1);
			} else if (v[0] === '"' && v[v.length - 1] === '"') {
				v = v.substring(1, v.length - 1);
			}
		}
		return v;
	});
}
