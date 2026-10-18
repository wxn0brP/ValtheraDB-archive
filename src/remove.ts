import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { PostgreSQLValthera } from "./actions";
import { find } from "./find";
import { quoteIdentifier } from "./storage/identifiers";
import { POSTGRES_STORAGE_ID } from "./types";

const BATCH_SIZE = +process.env.VALTHERA_POSTGRES_BATCH_SIZE || 500;

export async function remove(
	pgv: PostgreSQLValthera,
	query: VQueryT.Remove,
	one: boolean,
) {
	const { collection } = query;
	const toDelete = await find(pgv, {
		...query,
		dbFindOpts: {
			...((query as any).dbFindOpts || {}),
			limit: one ? 1 : undefined,
		},
	});

	if (!toDelete.length) return [];

	const primaryKey = pgv.primaryKey(collection);

	for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
		const batch = toDelete.slice(i, i + BATCH_SIZE);
		await pgv.query(
			`DELETE FROM ${pgv.table(collection)} WHERE ${quoteIdentifier(primaryKey)} = ANY($1::text[])`,
			[
				batch.map(
					doc => (doc as any)[POSTGRES_STORAGE_ID] ?? (doc as any)[primaryKey],
				),
			],
		);
	}

	return toDelete as DataInternal[];
}
