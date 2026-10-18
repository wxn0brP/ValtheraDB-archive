import { QueryValidationError } from "@wxn0brp/db-core/errors";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { PostgreSQLValthera } from "../actions";
import { encodeValue } from "./codec";
import { columnForField, sqlColumnForField } from "./identifiers";
import { getColumns } from "./schema";

function isPlainObject(value: any) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function simpleOperatorSql(
	field: string,
	operator: string,
	value: any,
	values: any[],
) {
	if (operator.toLowerCase() === "$exists") {
		return value
			? `${sqlColumnForField(field)} IS NOT NULL`
			: `${sqlColumnForField(field)} IS NULL`;
	}

	const encoded = encodeValue(value);
	if (encoded.sqlType === "BYTEA") return null;

	values.push(encoded.value);
	const param = `$${values.length}`;
	const column = sqlColumnForField(field);

	switch (operator.toLowerCase()) {
		case "$gt":
			return `${column} > ${param}`;
		case "$lt":
			return `${column} < ${param}`;
		case "$gte":
			return `${column} >= ${param}`;
		case "$lte":
			return `${column} <= ${param}`;
		case "$in":
			values.pop();
			if (!Array.isArray(value)) return null;
			if (value.some(item => encodeValue(item).sqlType === "BYTEA"))
				return null;
			values.push(value.map(item => encodeValue(item).value));
			return `${column} = ANY($${values.length})`;
		case "$nin":
			values.pop();
			if (!Array.isArray(value)) return null;
			if (value.some(item => encodeValue(item).sqlType === "BYTEA"))
				return null;
			values.push(value.map(item => encodeValue(item).value));
			return `NOT (${column} = ANY($${values.length}))`;
		case "$between":
			values.pop();
			if (!Array.isArray(value) || value.length !== 2) return null;
			if (
				encodeValue(value[0]).sqlType === "BYTEA" ||
				encodeValue(value[1]).sqlType === "BYTEA"
			)
				return null;
			values.push(encodeValue(value[0]).value, encodeValue(value[1]).value);
			return `${column} BETWEEN $${values.length - 1} AND $${values.length}`;
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

	if (!search || typeof search === "function" || Array.isArray(search))
		return {
			sql: "",
			values,
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
			};
		}
		if (isPlainObject(value)) continue;

		const col = columns.get(columnForField(key));
		if (col?.udtName === "bytea" && value !== null && value !== undefined)
			continue;

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
		if (encoded.sqlType === "BYTEA") continue;

		if (key === primaryKey && typeof value !== "string") {
			values.push(String(value));
		} else {
			values.push(encoded.value);
		}
		clauses.push(`${sqlColumnForField(key)} = $${values.length}`);
	}

	for (const [operator, condition] of Object.entries(search)) {
		if (!operator.startsWith("$") || !isPlainObject(condition)) continue;
		if (operator.toLowerCase() === "$not") continue;

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
				if (operator.toLowerCase() === "$exists" && value === false) continue;
				return {
					sql: "WHERE FALSE",
					values: [],
				};
			}

			const col = columns.get(columnForField(field));
			if (col?.udtName === "bytea" && operator.toLowerCase() !== "$exists")
				continue;

			const clause = simpleOperatorSql(field, operator, value, values);
			if (clause) clauses.push(clause);
		}
	}

	return {
		sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
		values,
	};
}
