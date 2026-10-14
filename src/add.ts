import { QueryValidationError } from "@wxn0brp/db-core";
import { addId, addIdBulk } from "@wxn0brp/db-core/helpers/addId";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { SQLiteValthera } from "./actions";
import { execStmt, qid, toSqlValue } from "./utils";

export async function add(slv: SQLiteValthera, config: VQueryT.Add) {
	const { data, collection } = config;
	await addId(config, slv, true);

	const entries = Object.entries(data).filter(([, v]) => v !== undefined);
	if (entries.length === 0)
		throw new QueryValidationError(
			`Cannot insert an empty document into "${collection}"`,
			{
				collection,
				op: "add",
			},
		);

	await slv._ensureColumns(
		collection,
		entries.map(([k]) => k),
	);
	const affinities = await slv._getColumnAffinities(collection);

	const keys = entries.map(([k]) => k);
	const placeholders = keys.map(() => "?").join(", ");
	const values = entries.map(([k, v]) => toSqlValue(v, affinities[k]));
	const sql = `INSERT INTO ${qid(collection)} (${keys.map(k => qid(k)).join(", ")}) VALUES (${placeholders})`;

	const stmt = await slv._prepare(sql);
	await execStmt(stmt, "run", ...values);
	return data;
}

export async function bulkAdd(slv: SQLiteValthera, config: VQueryT.BulkAdd) {
	const { collection, datas } = config;
	if (datas.length === 0) return datas;

	await addIdBulk(config, slv, true);

	const keySet = new Set<string>();
	for (const data of datas)
		for (const k of Object.keys(data)) if (data[k] !== undefined) keySet.add(k);
	const keys = [
		...keySet,
	];

	await slv._ensureColumns(collection, keys);
	const affinities = await slv._getColumnAffinities(collection);

	const placeholders = keys.map(() => "?").join(", ");
	const stmt = await slv._prepare(
		`INSERT INTO ${qid(collection)} (${keys.map(k => qid(k)).join(", ")}) VALUES (${placeholders})`,
	);
	for (const data of datas) {
		const values = keys.map(k => {
			const v = data[k];
			return v === undefined ? null : toSqlValue(v, affinities[k]);
		});
		await execStmt(stmt, "run", ...values);
	}
	return datas;
}
