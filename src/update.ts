import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { updateObjectAdvanced } from "@wxn0brp/db-core/utils/updateObject";
import { AccDBValthera } from ".";
import { find } from "./find";
import { escapeValue } from "./utils";

export async function update(
	slv: AccDBValthera,
	query: VQueryT.Update,
	one: boolean,
) {
	const { collection, updater, context } = query;

	const matched = await find(slv, {
		...query,
		dbFindOpts: {
			limit: one ? 1 : undefined,
		},
	});

	if (matched.length === 0) return [];
	const key = slv.primaryKey[collection] || "_id";

	const updateOne = async (target: any) => {
		const newData: any =
			typeof updater === "function"
				? updater(target, context)
				: updateObjectAdvanced(target, updater);

		if (newData[key] !== target[key]) newData[key] = target[key];

		const keys = Object.keys(newData).filter(k => k !== key);
		const set = keys.map(k => `[${k}] = ${escapeValue(newData[k])}`).join(", ");

		const sql = `UPDATE [${collection}] SET ${set} WHERE [${key}] = ${escapeValue(target[key])}`;
		await slv.db.query(sql);
		return newData;
	};

	const results = [];

	for (const target of matched) results.push(await updateOne(target));

	return results as DataInternal[];
}
