import type { ValtheraClass } from "@wxn0brp/db-core";
import { collectionPrefix } from "./static";

export async function compact(
	db: ValtheraClass,
	collection: string,
	prefix: string = collectionPrefix,
) {
	const logCol = prefix + "/" + collection;
	const data = await db.find({
		collection,
		search: {},
	});

	await db.removeCollection(logCol);

	await db.adapter.updateOneOrAdd({
		collection: prefix,
		search: {
			_id: collection,
		},
		updater: {
			time: Date.now(),
		},
	});

	for (const d of data) {
		await db.adapter.add({
			collection: logCol,
			data: {
				p: d,
			},
			id_gen: false,
		});
	}
}
