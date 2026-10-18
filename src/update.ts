import { Data, DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { updateObj } from "@wxn0brp/db-core/utils/process";
import { PostgreSQLValthera } from "./actions";
import { find } from "./find";
import { encodeValue, serializeData } from "./storage/codec";
import { quoteIdentifier, sqlColumnForField } from "./storage/identifiers";
import { ensureColumns, getColumns } from "./storage/schema";
import { POSTGRES_STORAGE_ID } from "./types";

const SIMPLE_OPS = new Set([
	"$set",
	"$inc",
	"$dec",
]);

interface SimpleUpdate {
	set: string;
	values: any[];
	columns: string[];
}

function tryBuildSimpleUpdate(
	updater: Record<string, any>,
	primaryKey: string,
): SimpleUpdate | null {
	const $fields: Record<string, any> = {};
	const flatFields: Record<string, any> = {};

	for (const k of Object.keys(updater)) {
		if (k.startsWith("$")) {
			$fields[k.toLowerCase()] = updater[k];
		} else {
			flatFields[k] = updater[k];
		}
	}

	if (Object.keys($fields).some(k => !SIMPLE_OPS.has(k))) return null;

	const setClauses: string[] = [];
	const values: any[] = [];
	const columns: string[] = [];

	if ("$set" in $fields) {
		for (const [field, value] of Object.entries($fields["$set"])) {
			if (field === primaryKey) continue;
			columns.push(field);
			const encoded = encodeValue(value);
			values.push(encoded.value);
			setClauses.push(`${sqlColumnForField(field)} = $${values.length}`);
		}
	}

	if ("$inc" in $fields) {
		for (const [field, value] of Object.entries($fields["$inc"])) {
			if (field === primaryKey) continue;
			if (typeof value !== "number") return null;
			columns.push(field);
			const f = sqlColumnForField(field);
			values.push(value, value);
			setClauses.push(
				`${f} = CASE WHEN ${f} IS NULL THEN $${values.length - 1} WHEN pg_typeof(${f})::text IN ('integer','bigint','numeric','double precision','real') THEN ${f} + $${values.length} ELSE ${f} END`,
			);
		}
	}

	if ("$dec" in $fields) {
		for (const [field, value] of Object.entries($fields["$dec"])) {
			if (field === primaryKey) continue;
			if (typeof value !== "number") return null;
			columns.push(field);
			const f = sqlColumnForField(field);
			values.push(value, value);
			setClauses.push(
				`${f} = CASE WHEN ${f} IS NULL THEN (-1 * $${values.length - 1}) WHEN pg_typeof(${f})::text IN ('integer','bigint','numeric','double precision','real') THEN ${f} - $${values.length} ELSE ${f} END`,
			);
		}
	}

	for (const [field, value] of Object.entries(flatFields)) {
		if (field === primaryKey) continue;
		if (typeof value === "object" && value !== null) return null;
		columns.push(field);
		const encoded = encodeValue(value);
		values.push(encoded.value);
		setClauses.push(`${sqlColumnForField(field)} = $${values.length}`);
	}

	if (setClauses.length === 0) return null;

	return {
		set: setClauses.join(", "),
		values,
		columns,
	};
}

export async function update(
	pgv: PostgreSQLValthera,
	query: VQueryT.Update,
	one: boolean,
) {
	const { collection, updater } = query;
	const primaryKey = pgv.primaryKey(collection);

	if (!one && typeof updater !== "function") {
		const simpleUpdate = tryBuildSimpleUpdate(updater as any, primaryKey);
		if (simpleUpdate) {
			await ensureColumns(
				pgv,
				collection,
				simpleUpdate.columns.map(c => ({
					key: c,
					value: null,
					sqlType: "TEXT",
				})),
			);

			const matched = await find(pgv, query);
			if (matched.length === 0) return [];

			const pks = matched.map(doc => (doc as any)[primaryKey]);
			const setValues = simpleUpdate.values;
			const whereClause = `${quoteIdentifier(primaryKey)} = ANY($${setValues.length + 1}::text[])`;
			const allValues = [
				...setValues,
				pks,
			];

			const sql = `UPDATE ${pgv.table(collection)} SET ${simpleUpdate.set} WHERE ${whereClause}`;
			await pgv.query(sql, allValues);

			return matched.map(row => {
				const pk = (row as any)[primaryKey];
				const newData = updateObj(query, row) as Data;
				if ((newData as any)[primaryKey] !== pk) {
					(newData as any)[primaryKey] = pk;
				}
				return newData as DataInternal;
			});
		}
	}

	const matched = await find(pgv, {
		...query,
		dbFindOpts: {
			...((query as any).dbFindOpts || {}),
			limit: one ? 1 : undefined,
		},
	});

	if (!matched.length) return [];

	const results: Data[] = [];
	const columns = await getColumns(pgv, collection);

	for (const target of matched) {
		const storageId =
			(target as any)[POSTGRES_STORAGE_ID] ?? (target as any)[primaryKey];
		const newData = updateObj(query, target) as Data;
		if ((target as any)[primaryKey] !== undefined)
			(newData as any)[primaryKey] = (target as any)[primaryKey];
		else if ((newData as any)[primaryKey] !== undefined)
			delete (newData as any)[primaryKey];

		const fields = serializeData(newData, primaryKey);
		await ensureColumns(pgv, collection, fields, columns);

		const assignments: string[] = [];
		const values: any[] = [];

		for (const field of fields) {
			values.push(field.value);
			assignments.push(`${sqlColumnForField(field.key)} = $${values.length}`);
		}

		if (!assignments.length) {
			results.push(newData);
			continue;
		}

		values.push(storageId);
		await pgv.query(
			`UPDATE ${pgv.table(collection)}
			 SET ${assignments.join(", ")}
			 WHERE ${quoteIdentifier(primaryKey)} = $${values.length}`,
			values,
		);

		results.push(newData);
	}

	return results as DataInternal[];
}
