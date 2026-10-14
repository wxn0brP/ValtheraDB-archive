import { Data, DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { updateObj } from "@wxn0brp/db-core/utils/process";
import { SQLiteValthera } from "./actions";
import { buildWhere } from "./buildWhere";
import { COMPLEX_OPS } from "./const";
import { find } from "./find";
import { AffinityMap } from "./types";
import { execStmt, qid, toSqlValue } from "./utils";

export async function update(
	slv: SQLiteValthera,
	query: VQueryT.Update,
	one: boolean,
) {
	const { collection, updater } = query;

	const matched = await find(slv, {
		...query,
		dbFindOpts: {
			limit: one ? 1 : undefined,
		},
	});

	if (matched.length === 0) return [];

	const key = slv.primaryKey[collection] || "_id";

	if (typeof updater === "function") {
		const results = [];
		for (const target of matched)
			results.push(await updateOne(slv, query, target, key));
		return results as DataInternal[];
	}

	const affinities = await slv._getColumnAffinities(collection);
	const where = buildWhere(query.search, affinities);

	if (where.sql && !where.postFilter) {
		const incFields = collectIncDecFields(updater as any);
		const incCompatible =
			incFields.length === 0 ||
			matched.every(row =>
				incFields.every(field => {
					const v = row[field];
					return v === undefined || v === null || typeof v === "number";
				}),
			);
		const simpleUpdateSql = incCompatible
			? tryBuildSimpleUpdate(updater as any, key, affinities)
			: null;
		if (simpleUpdateSql) {
			await slv._ensureColumns(collection, simpleUpdateSql.columns);

			const sql = `UPDATE ${qid(collection)} SET ${simpleUpdateSql.set} WHERE ${where.sql}`;
			const values = [
				...simpleUpdateSql.values,
				...where.values,
			];
			const stmt = await slv._prepare(sql);
			await execStmt(stmt, "run", ...values);

			return matched.map(row => {
				const pk = row[key];
				const newData = updateObj(query, row) as Data;
				if (newData[key] !== pk) newData[key] = pk;
				return newData as DataInternal;
			});
		}
	}

	const stmtCache: Map<string, any> = new Map();
	const getStmt = async (sql: string) => {
		const cached = stmtCache.get(sql);
		if (cached) return cached;
		const stmt = await slv._prepare(sql);
		stmtCache.set(sql, stmt);
		return stmt;
	};

	const results = [];
	for (const target of matched)
		results.push(await updateOne(slv, query, target, key, getStmt));

	return results as DataInternal[];
}

async function updateOne(
	slv: SQLiteValthera,
	query: VQueryT.Update,
	target: any,
	key: string,
	getStmt?: (sql: string) => Promise<any>,
) {
	const beforeKeys = Object.keys(target);
	const pkValue = target[key];
	const newData = updateObj(query, target) as Data;

	if (newData[key] !== pkValue) newData[key] = pkValue;

	const affinities = await slv._getColumnAffinities(query.collection);
	const setClauses: string[] = [];
	const values: any[] = [];
	const columns: string[] = [];

	for (const k of Object.keys(newData)) {
		if (k === key) continue;
		columns.push(k);
		if (newData[k] === undefined) {
			setClauses.push(`${qid(k)} = NULL`);
			continue;
		}
		setClauses.push(`${qid(k)} = ?`);
		values.push(toSqlValue(newData[k], affinities[k]));
	}

	for (const k of beforeKeys) {
		if (k === key || k in newData) continue;
		columns.push(k);
		setClauses.push(`${qid(k)} = NULL`);
	}

	await slv._ensureColumns(query.collection, columns);
	if (setClauses.length === 0) return newData;

	const sql = `UPDATE ${qid(query.collection)} SET ${setClauses.join(", ")} WHERE ${qid(key)} = ?`;
	const stmt = getStmt ? await getStmt(sql) : await slv._prepare(sql);

	await execStmt(stmt, "run", ...values, pkValue);
	return newData;
}

interface SimpleUpdate {
	set: string;
	values: any[];
	columns: string[];
}

function tryBuildSimpleUpdate(
	updater: Record<string, any>,
	key: string,
	affinities: AffinityMap,
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

	const hasComplex = Object.keys($fields).some(k =>
		COMPLEX_OPS.includes("$" + k),
	);
	if (hasComplex) return null;

	const setClauses: string[] = [];
	const values: any[] = [];
	const columns: string[] = [];

	if ("$set" in $fields) {
		for (const [field, value] of Object.entries($fields["$set"])) {
			if (field === key) continue;
			columns.push(field);
			if (value === undefined) {
				setClauses.push(`${qid(field)} = NULL`);
				continue;
			}
			setClauses.push(`${qid(field)} = ?`);
			values.push(toSqlValue(value, affinities[field]));
		}
	}

	if ("$inc" in $fields) {
		for (const [field, value] of Object.entries($fields["$inc"])) {
			if (field === key) continue;
			if (typeof value !== "number") return null;
			columns.push(field);
			setClauses.push(incDecClause(field, "+"));
			values.push(value, value);
		}
	}

	if ("$dec" in $fields) {
		for (const [field, value] of Object.entries($fields["$dec"])) {
			if (field === key) continue;
			if (typeof value !== "number") return null;
			columns.push(field);
			setClauses.push(incDecClause(field, "-"));
			values.push(value, value);
		}
	}

	for (const [field, value] of Object.entries(flatFields)) {
		if (field === key) continue;
		if (typeof value === "object" && value !== null) return null;
		columns.push(field);
		if (value === undefined) {
			setClauses.push(`${qid(field)} = NULL`);
			continue;
		}
		setClauses.push(`${qid(field)} = ?`);
		values.push(toSqlValue(value, affinities[field]));
	}

	if (setClauses.length === 0) return null;

	return {
		set: setClauses.join(", "),
		values,
		columns,
	};
}

function incDecClause(field: string, op: "+" | "-"): string {
	const f = qid(field);
	return `${f} = CASE WHEN ${f} IS NULL THEN ? WHEN typeof(${f}) IN ('integer','real') THEN ${f} ${op} ? ELSE ${f} END`;
}

function collectIncDecFields(updater: Record<string, any>): string[] {
	const fields: string[] = [];
	for (const op of [
		"$inc",
		"$dec",
	]) {
		const map = updater[op];
		if (typeof map === "object" && map !== null)
			fields.push(...Object.keys(map));
	}
	return fields;
}
