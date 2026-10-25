import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { MariaDBValthera } from "./actions";
import { find } from "./find";
import { quoteIdentifier } from "./storage/identifiers";

export const BATCH_SIZE = +process.env.VALTHERA_MARIADB_BATCH_SIZE || 500;

export async function remove(
	mv: MariaDBValthera,
	query: VQueryT.Remove,
	one: boolean,
) {
	const { collection } = query;
	await mv.ensureCollection(collection);

	const toDelete = await find(mv, {
		...query,
		dbFindOpts: {
			...((query as any).dbFindOpts || {}),
			limit: one ? 1 : undefined,
		},
	});

	if (!toDelete.length) return [];

	const primaryKey = mv.primaryKey(collection);

	for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
		const batch = toDelete.slice(i, i + BATCH_SIZE);
		const placeholders = batch.map(() => "?").join(", ");
		await mv.query(
			`DELETE FROM ${mv.table(collection)} WHERE ${quoteIdentifier(primaryKey)} IN (${placeholders})`,
			batch.map(doc => (doc as any)[primaryKey]),
		);
	}

	return toDelete as DataInternal[];
}
