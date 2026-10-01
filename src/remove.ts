import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { AccDBValthera } from ".";
import { find } from "./find";
import { escapeValue } from "./utils";

export async function remove(
	slv: AccDBValthera,
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

	for (const entry of toDelete)
		await slv.db.query(
			`DELETE FROM [${collection}] WHERE [${key}] = ${escapeValue(entry[key])}`,
		);

	return toDelete as DataInternal[];
}
