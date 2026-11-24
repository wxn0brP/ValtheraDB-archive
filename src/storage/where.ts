import { QueryValidationError } from "@wxn0brp/db-core/errors";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { PostgreSQLValthera } from "../adapter";
import { encodeValue } from "./codec";
import { columnForField, sqlColumnForField } from "./identifiers";
import { getColumns } from "./schema";
import type { ColumnInfo } from "./types";

function isPlainObject(value: any) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const NUMERIC_COLUMNS = new Set([
	"float4",
	"float8",
	"int2",
	"int4",
	"int8",
	"numeric",
]);
const TEXT_COLUMNS = new Set([
	"text",
	"varchar",
	"bpchar",
	"name",
	"citext",
]);

function matchesColumnType(type: string, udtName?: string) {
	if (!udtName) return false;
	if (type === "number") return NUMERIC_COLUMNS.has(udtName);
	if (type === "string") return TEXT_COLUMNS.has(udtName);
	if (type === "boolean") return udtName === "bool";
	return false;
}

function simpleOperatorSql(
	field: string,
	operator: string,
	value: any,
	values: any[],
	col?: ColumnInfo,
) {
	const op = operator.toLowerCase();
	const column = sqlColumnForField(field);

	if (op === "$exists") {
		return value ? `${column} IS NOT NULL` : `${column} IS NULL`;
	}

	if (op === "$in" || op === "$nin") {
		if (!Array.isArray(value) || value.length === 0) return null;
		if (
			value.some(
				item => item === undefined || encodeValue(item).sqlType === "BYTEA",
			)
		)
			return null;

		const type = typeof value[0];
		if (value.some(item => typeof item !== type)) return null;
		if (!matchesColumnType(type, col?.udtName)) return null;

		values.push(value.map(item => encodeValue(item).value));
		const param = `$${values.length}`;
		if (op === "$in") return `${column} = ANY(${param})`;
		return `(${column} <> ALL(${param}) OR ${column} IS NULL)`;
	}

	if (op === "$between") {
		if (!Array.isArray(value) || value.length !== 2) return null;
		if (typeof value[0] !== "number" || typeof value[1] !== "number")
			return null;
		if (!matchesColumnType("number", col?.udtName)) return null;
		values.push(encodeValue(value[0]).value, encodeValue(value[1]).value);
		return `${column} BETWEEN $${values.length - 1} AND $${values.length}`;
	}

	const encoded = encodeValue(value);
	if (encoded.sqlType === "BYTEA") return null;

	values.push(encoded.value);
	const param = `$${values.length}`;

	switch (op) {
		case "$gt":
			return `${column} > ${param}`;
		case "$lt":
			return `${column} < ${param}`;
		case "$gte":
			return `${column} >= ${param}`;
		case "$lte":
			return `${column} <= ${param}`;
		default:
			values.pop();
			return null;
	}
}

export async function buildWhere(
	pgv: PostgreSQLValthera,
	collection: string,
	config: VQueryT.Find | VQueryT.Update | VQueryT.Remove,
) {
	const search = (config as any).search;
	const values: any[] = [];
	const clauses: string[] = [];
	let partial = false;

	if (!search)
		return {
			sql: "",
			values,
			partial,
		};

	if (typeof search !== "object" || Array.isArray(search))
		return {
			sql: "",
			values,
			partial: true,
		};

	const columns = await getColumns(pgv, collection);
	const primaryKey = pgv.primaryKey(collection);

	for (const [key, value] of Object.entries(search)) {
		if (key.startsWith("$")) continue;
		if (!columns.has(columnForField(key))) {
			if (pgv.mode === "strict")
				throw new QueryValidationError(
					`PostgreSQL column ${sqlColumnForField(key)} for field "${key}" does not exist in table ${pgv.table(collection)}`,
					{
						collection,
						field: key,
						mode: pgv.mode,
					},
				);
			return {
				sql: "WHERE FALSE",
				values: [],
				partial: false,
			};
		}
		if (isPlainObject(value)) {
			partial = true;
			continue;
		}

		const col = columns.get(columnForField(key));
		if (col?.udtName === "bytea" && value !== null && value !== undefined) {
			partial = true;
			continue;
		}

		if (value === undefined) {
			clauses.push(`${sqlColumnForField(key)} IS NULL`);
			continue;
		}

		if (value === null) {
			const encoded = encodeValue(value);
			values.push(encoded.value);
			clauses.push(`${sqlColumnForField(key)} = $${values.length}`);
			continue;
		}

		const encoded = encodeValue(value);
		if (encoded.sqlType === "BYTEA") {
			partial = true;
			continue;
		}

		if (key === primaryKey && typeof value !== "string") {
			values.push(String(value));
		} else {
			values.push(encoded.value);
		}
		clauses.push(`${sqlColumnForField(key)} = $${values.length}`);
	}

	for (const [operator, condition] of Object.entries(search)) {
		if (!operator.startsWith("$")) continue;
		if (!isPlainObject(condition)) {
			partial = true;
			continue;
		}

		const op = operator.toLowerCase();
		if (op === "$and" || op === "$or" || op === "$not" || op === "$subset") {
			partial = true;
			continue;
		}

		for (const [field, value] of Object.entries(
			condition as Record<string, any>,
		)) {
			if (!columns.has(columnForField(field))) {
				if (pgv.mode === "strict")
					throw new QueryValidationError(
						`PostgreSQL column ${sqlColumnForField(field)} for field "${field}" does not exist in table ${pgv.table(collection)}`,
						{
							collection,
							field,
							operator,
							mode: pgv.mode,
						},
					);
				if (op === "$exists" && value === false) continue;
				return {
					sql: "WHERE FALSE",
					values: [],
					partial: false,
				};
			}

			const col = columns.get(columnForField(field));
			if (col?.udtName === "bytea" && op !== "$exists") {
				partial = true;
				continue;
			}

			const clause = simpleOperatorSql(field, operator, value, values, col);
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
