import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import type { AccDBValthera } from "./index";
import { selectMatching } from "./find";
import { VID, sqlIdent, sqlString } from "./utils";

export async function remove(
	slv: AccDBValthera,
	query: VQueryT.Remove,
	one: boolean,
) {
	const { collection } = query;

	const rows = await selectMatching(slv, query, one ? 1 : undefined);

	for (const row of rows)
		await slv.db.query(
			`DELETE FROM ${sqlIdent(collection)} WHERE ${sqlIdent(VID)} = ${sqlString(row.vid)}`,
		);

	return rows.map(row => row.doc) as DataInternal[];
}
