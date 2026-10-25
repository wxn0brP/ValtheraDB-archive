import { VQueryT } from "@wxn0brp/db-core/types/query";
import type { MariaDBValthera } from "../actions";
import { encodeValue } from "./codec";
import { columnForField, quoteIdentifier } from "./identifiers";
import { getColumns, isBlobColumn } from "./schema";

export interface WhereResult {
	sql: string;
	values: any[];
	partial: boolean;
}

const SKIP_OPERATORS = new Set([
	"$and",
	"$or",
	"$not",
	"$subset",
]);

function isPlainObject(value: any) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeForColumn(
	mv: MariaDBValthera,
	field: string,
	value: any,
	primaryKey: string,
) {
	if (field === primaryKey && typeof value !== "string") return String(value);
	return encodeValue(value, mv.compositeEncoding).value;
}

function simpleOperatorSql(
	mv: MariaDBValthera,
	field: string,
	operator: string,
	value: any,
	values: any[],
	primaryKey: string,
): string | null {
	const column = quoteIdentifier(field);
	const op = operator.toLowerCase();

	if (op === "$exists")
		return value ? `${column} IS NOT NULL` : `${column} IS NULL`;

	if (op === "$between") {
		if (!Array.isArray(value) || value.length !== 2) return null;
		if (typeof value[0] !== "number" || typeof value[1] !== "number")
			return null;
		values.push(value[0], value[1]);
		return `${column} BETWEEN ? AND ?`;
	}

	if (op === "$in" || op === "$nin") {
		if (!Array.isArray(value) || value.length === 0) return null;
		const encoded: any[] = [];
		for (const item of value) {
			if (isPlainObject(item)) return null;
			encoded.push(encodeForColumn(mv, field, item, primaryKey));
		}
		values.push(...encoded);
		const placeholders = encoded.map(() => "?").join(", ");
		if (op === "$in") return `${column} IN (${placeholders})`;
		return `${column} NOT IN (${placeholders})`;
	}

	if (isPlainObject(value)) return null;

	switch (op) {
		case "$gt":
		case "$lt":
		case "$gte":
		case "$lte": {
			if (
				typeof value !== "number" &&
				typeof value !== "string" &&
				typeof value !== "boolean"
			)
				return null;
			const sqlOp =
				op === "$gt" ? ">" : op === "$lt" ? "<" : op === "$gte" ? ">=" : "<=";
			values.push(encodeForColumn(mv, field, value, primaryKey));
			return `${column} ${sqlOp} ?`;
		}
		default:
			return null;
	}
}

export async function buildWhere(
	mv: MariaDBValthera,
	collection: string,
	config: VQueryT.Find | VQueryT.Update | VQueryT.Remove,
): Promise<WhereResult> {
	const search = (config as any).search;

	if (
		!search ||
		typeof search === "function" ||
		Array.isArray(search) ||
		typeof search !== "object"
	)
		return {
			sql: "",
			values: [],
			partial: false,
		};

	const values: any[] = [];
	const clauses: string[] = [];
	let partial = false;

	const columns = await getColumns(mv, collection);
	const primaryKey = mv.primaryKey(collection);

	for (const [key, value] of Object.entries(search)) {
		if (key.startsWith("$")) continue;
		if (isPlainObject(value)) {
			partial = true;
			continue;
		}

		const column = columns.get(columnForField(key));
		if (!column) {
			if (mv.mode === "strict")
				throw new Error(
					`MariaDB column ${quoteIdentifier(columnForField(key))} for field "${key}" does not exist in table ${mv.table(collection)}`,
				);
			partial = true;
			continue;
		}

		if (value === undefined) {
			clauses.push(`${quoteIdentifier(key)} IS NULL`);
			continue;
		}

		if (isBlobColumn(column)) {
			partial = true;
			continue;
		}

		if (value === null) {
			partial = true;
			continue;
		}

		values.push(encodeForColumn(mv, key, value, primaryKey));
		clauses.push(`${quoteIdentifier(key)} = ?`);
	}

	for (const [operator, condition] of Object.entries(search)) {
		if (!operator.startsWith("$") || !isPlainObject(condition)) continue;
		if (SKIP_OPERATORS.has(operator.toLowerCase())) {
			partial = true;
			continue;
		}

		for (const [field, value] of Object.entries(
			condition as Record<string, any>,
		)) {
			const column = columns.get(columnForField(field));
			if (!column) {
				if (mv.mode === "strict")
					throw new Error(
						`MariaDB column ${quoteIdentifier(columnForField(field))} for field "${field}" does not exist in table ${mv.table(collection)}`,
					);
				partial = true;
				continue;
			}

			if (isBlobColumn(column) && operator.toLowerCase() !== "$exists") {
				partial = true;
				continue;
			}

			const clause = simpleOperatorSql(
				mv,
				field,
				operator,
				value,
				values,
				primaryKey,
			);
			if (clause) clauses.push(clause);
			else partial = true;
		}
	}

	return {
		sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
		values,
		partial,
	};
}
