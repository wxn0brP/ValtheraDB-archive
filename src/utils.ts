export const VID = "__vid";
export const SPILL = "__vfields";

export function escapeValue(val: any) {
	if (val === null || val === undefined) return "NULL";
	if (typeof val === "number") return val.toString();
	if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
	if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
	if (typeof val === "object")
		return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
	return `'${String(val).replace(/'/g, "''")}'`;
}

export function sqlString(value: unknown) {
	return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

export function sqlIdent(name: string) {
	return `[${name.replace(/\]/g, "]]")}]`;
}

export function isSafeIdent(name: string) {
	return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name);
}

export function decodeCell(value: unknown) {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function splitTop(input: string, sep: string) {
	const out: string[] = [];
	let depth = 0;
	let current = "";
	let quote: string = null;

	for (const ch of input) {
		if (quote) {
			current += ch;
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === "`") {
			quote = ch;
			current += ch;
			continue;
		}
		if (ch === "[" || ch === "(") depth++;
		else if (ch === "]" || ch === ")") depth--;
		if (ch === sep && depth === 0) {
			out.push(current);
			current = "";
			continue;
		}
		current += ch;
	}

	if (current.trim()) out.push(current);

	return out;
}

function readIdentifier(input: string) {
	const trimmed = input.trimStart();

	if (trimmed.startsWith("[")) {
		const end = trimmed.indexOf("]");
		if (end === -1) return null;
		return {
			value: trimmed.slice(1, end),
			raw: trimmed.slice(0, end + 1),
		};
	}

	const match = /^[^\s(]+/.exec(trimmed);
	if (!match) return null;

	return {
		value: match[0],
		raw: match[0],
	};
}

export function normalizeCreateTable(sql: string) {
	const source = sql.trim().replace(/;\s*$/, "");
	const match = /^create\s+table\s+(.+?)\s*\(([\s\S]*)\)$/i.exec(source);
	if (!match) return null;

	const tableName = readIdentifier(match[1].trim());
	if (!tableName) return null;

	const seen = new Set<string>();
	const columns: string[] = [];

	for (const def of splitTop(match[2], ",")) {
		const identifier = readIdentifier(def);
		if (!identifier) continue;
		const rest = def.trimStart().slice(identifier.raw.length).trim();
		if (!rest) continue;
		const key = identifier.value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		columns.push(`${sqlIdent(identifier.value)} MEMO`);
	}

	if (!columns.length) return null;
	if (!seen.has(VID.toLowerCase())) columns.push(`${sqlIdent(VID)} MEMO`);

	return `CREATE TABLE ${sqlIdent(tableName.value)} (${columns.join(", ")})`;
}

export function createTableName(sql: string) {
	const match = /^\s*create\s+table\s+(.+?)\s*\(/i.exec(sql.trim());
	if (!match) return null;

	const identifier = readIdentifier(match[1].trim());
	if (!identifier) return null;

	return identifier.value;
}
