import { Data } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { findUtil } from "@wxn0brp/db-core/utils/action";
import { findObj } from "@wxn0brp/db-core/utils/process";
import { SQLiteValthera } from "./actions";
import { buildWhere } from "./buildWhere";
import { decodeSqlValue, execStmt, qid } from "./utils";

function parseRow(row: Record<string, any>): Record<string, any> {
	const parsed: Record<string, any> = {};
	for (const [key, value] of Object.entries(row)) {
		if (value instanceof Uint8Array) {
			parsed[key] = decodeSqlValue(value);
			continue;
		}
		if (value === null) continue;
		if (
			typeof value === "string" &&
			((value.startsWith("[") && value.endsWith("]")) ||
				(value.startsWith("{") && value.endsWith("}")))
		) {
			try {
				parsed[key] = JSON.parse(value);
				continue;
			} catch {}
		}
		parsed[key] = value;
	}
	return parsed;
}

export async function find(
	slv: SQLiteValthera,
	config: VQueryT.Find,
): Promise<Data[]> {
	const { collection, search } = config;

	const affinities = await slv._getColumnAffinities(collection);
	const where = buildWhere(search, affinities);

	let sqlResult = [];

	if (where.sql) {
		const stmt = await slv._prepare(
			`SELECT * FROM ${qid(collection)} WHERE ${where.sql}`,
		);
		sqlResult = await execStmt(stmt, "all", ...where.values);
	} else {
		const stmt = await slv._prepare(`SELECT * FROM ${qid(collection)}`);
		sqlResult = await execStmt(stmt, "all");
	}

	sqlResult = sqlResult.map(parseRow);

	if (where.postFilter) {
		sqlResult = sqlResult.filter(where.postFilter);
	}

	const result = sqlResult.map(entry => findObj(config, entry)).filter(Boolean);

	return findUtil(config, result, []);
}
