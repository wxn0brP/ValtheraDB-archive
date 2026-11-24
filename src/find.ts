import { VQueryT } from "@wxn0brp/db-core/types/query";
import { findUtil } from "@wxn0brp/db-core/utils/findUtil";
import { findObj } from "@wxn0brp/db-core/utils/process";
import type { AccDBValthera } from "./index";
import { decodeCell, SPILL, sqlIdent, VID } from "./utils";

export interface Row {
	vid: string;
	doc: any;
}

function decodeRow(row: Record<string, any>) {
	const doc: Record<string, any> = {};

	for (const [column, value] of Object.entries(row)) {
		if (column === VID || column === SPILL) continue;
		if (value === null || value === undefined) continue;
		doc[column] = decodeCell(value);
	}

	const extra = row[SPILL];
	if (extra !== null && extra !== undefined) {
		const fields = decodeCell(extra);
		if (fields && typeof fields === "object" && !Array.isArray(fields))
			Object.assign(doc, fields);
	}

	return doc;
}

export async function selectRows(slv: AccDBValthera, collection: string) {
	await slv.init();
	if (!(await slv.issetCollection(collection))) return [];

	const result = (await slv.db.query(
		`SELECT * FROM ${sqlIdent(collection)}`,
	)) as any[];
	if (!Array.isArray(result)) return [];

	return result.map(
		row =>
			({
				vid: decodeCell(row[VID]),
				doc: decodeRow(row),
			}) as Row,
	);
}

export async function selectMatching(
	slv: AccDBValthera,
	query: VQueryT.Find | VQueryT.Update | VQueryT.Remove,
	limit?: number,
) {
	const rows = await selectRows(slv, query.collection);
	const out: Row[] = [];

	for (const row of rows) {
		if (
			!findObj(
				{
					collection: query.collection,
					search: query.search,
				},
				row.doc,
			)
		)
			continue;
		out.push(row);
		if (limit && out.length >= limit) break;
	}

	return out;
}

export async function find(slv: AccDBValthera, config: VQueryT.Find) {
	const rows = await selectRows(slv, config.collection);

	const datas: any[] = [];
	for (const row of rows) {
		const doc = findObj(config, row.doc);
		if (doc) datas.push(doc);
	}

	return findUtil(config, datas, [
		null,
	]);
}
