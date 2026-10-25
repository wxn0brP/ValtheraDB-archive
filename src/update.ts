import { Data, DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { updateObj } from "@wxn0brp/db-core/utils/process";
import { MariaDBValthera } from "./actions";
import { find } from "./find";
import { encodeValue, serializeData } from "./storage/codec";
import { columnForField, quoteIdentifier } from "./storage/identifiers";
import { ensureColumns, getColumns } from "./storage/schema";
import { SerializedField } from "./storage/types";

interface SimpleUpdate {
	set: string;
	values: any[];
	fields: SerializedField[];
}

function isPlainObject(value: any) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryBuildSimpleUpdate(
	mv: MariaDBValthera,
	updater: Record<string, any>,
	primaryKey: string,
): SimpleUpdate | null {
	const $fields: Record<string, any> = {};
	const flatFields: Record<string, any> = {};

	for (const key of Object.keys(updater)) {
		if (key.startsWith("$")) $fields[key.toLowerCase()] = updater[key];
		else flatFields[key] = updater[key];
	}

	if (Object.keys($fields).some(key => key !== "$set")) return null;

	const fields: SerializedField[] = [];

	if ("$set" in $fields) {
		const setMap = $fields["$set"];
		if (!isPlainObject(setMap)) return null;
		for (const [field, value] of Object.entries(setMap)) {
			if (field === primaryKey) continue;
			if (isPlainObject(value)) return null;
			fields.push({
				key: field,
				...encodeValue(value, mv.compositeEncoding),
			});
		}
	}

	for (const [field, value] of Object.entries(flatFields)) {
		if (field === primaryKey) continue;
		if (isPlainObject(value)) return null;
		fields.push({
			key: field,
			...encodeValue(value, mv.compositeEncoding),
		});
	}

	if (fields.length === 0) return null;

	return {
		set: fields
			.map(field => `${quoteIdentifier(columnForField(field.key))} = ?`)
			.join(", "),
		values: fields.map(field => field.value),
		fields,
	};
}

export async function update(
	mv: MariaDBValthera,
	query: VQueryT.Update,
	one: boolean,
) {
	const { collection, updater } = query;
	await mv.ensureCollection(collection);
	const primaryKey = mv.primaryKey(collection);

	if (!one && typeof updater !== "function") {
		const simple = tryBuildSimpleUpdate(mv, updater as any, primaryKey);
		if (simple) {
			await ensureColumns(mv, collection, simple.fields);

			const matched = await find(mv, query);
			if (matched.length === 0) return [];

			const pks = matched.map(doc => (doc as any)[primaryKey]);
			const placeholders = pks.map(() => "?").join(", ");
			await mv.query(
				`UPDATE ${mv.table(collection)} SET ${simple.set} WHERE ${quoteIdentifier(primaryKey)} IN (${placeholders})`,
				[
					...simple.values,
					...pks,
				],
			);

			return matched.map(row => {
				const pk = (row as any)[primaryKey];
				const newData = updateObj(query, row) as Data;
				if ((newData as any)[primaryKey] !== pk)
					(newData as any)[primaryKey] = pk;
				return newData as DataInternal;
			});
		}
	}

	const matched = await find(mv, {
		...query,
		dbFindOpts: {
			...((query as any).dbFindOpts || {}),
			limit: one ? 1 : undefined,
		},
	});

	if (matched.length === 0) return [];

	const results: DataInternal[] = [];
	const columns = await getColumns(mv, collection);

	for (const target of matched) {
		const beforeKeys = Object.keys(target);
		const pkValue = (target as any)[primaryKey];

		const newData = updateObj(query, target) as Data;
		if ((target as any)[primaryKey] !== undefined)
			(newData as any)[primaryKey] = (target as any)[primaryKey];
		else if (pkValue !== undefined) (newData as any)[primaryKey] = pkValue;

		const fields = serializeData(newData, primaryKey, mv.compositeEncoding);
		await ensureColumns(mv, collection, fields, columns);

		const assignments: string[] = [];
		const values: any[] = [];

		for (const field of fields) {
			values.push(field.value);
			assignments.push(`${quoteIdentifier(columnForField(field.key))} = ?`);
		}

		for (const key of beforeKeys) {
			if (key === primaryKey || key in newData) continue;
			assignments.push(`${quoteIdentifier(key)} = NULL`);
		}

		if (!assignments.length) {
			results.push(newData as DataInternal);
			continue;
		}

		const pk = (target as any)[primaryKey];
		values.push(pk);
		await mv.query(
			`UPDATE ${mv.table(collection)} SET ${assignments.join(", ")} WHERE ${quoteIdentifier(primaryKey)} = ?`,
			values,
		);

		results.push(newData as DataInternal);
	}

	return results;
}
