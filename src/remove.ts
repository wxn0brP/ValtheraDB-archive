import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { SQLiteValthera } from "./actions";
import { BATCH_SIZE } from "./const";
import { find } from "./find";
import { execStmt, qid } from "./utils";

export async function remove(
	slv: SQLiteValthera,
	query: VQueryT.Remove,
	one: boolean,
) {
	const { collection } = query;

	const toDelete = await find(slv, {
		...query,
		dbFindOpts: {
			limit: one ? 1 : undefined,
		},
	});

	if (!toDelete.length) return [];

	const key = slv.primaryKey[collection] || "_id";

	for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
		const batch = toDelete.slice(i, i + BATCH_SIZE);
		const stmt = await slv._prepare(
			`DELETE FROM ${qid(collection)} WHERE ${qid(key)} IN (${batch.map(() => "?").join(", ")})`,
		);
		await execStmt(stmt, "run", ...batch.map(d => d[key]));
	}

	return toDelete as DataInternal[];
}
