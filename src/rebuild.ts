import type { ValtheraClass } from "@wxn0brp/db-core";
import { sortByIds } from "@wxn0brp/db-core";
import { decodeCrdt } from "./serialize";
import { collectionPrefix } from "./static";

export async function rebuild(
	db: ValtheraClass,
	collection: string,
	prefix: string = collectionPrefix,
) {
	const logCol = prefix + "/" + collection;
	const operations = await db.find<any>({
		collection: logCol,
		search: {},
	});

	await db.removeCollection(collection);

	const adapter = db.adapter;
	const primaryOps = operations.filter((op: any) => op.p);
	for (const op of primaryOps) {
		await adapter.add({
			collection,
			data: decodeCrdt(op.p),
			id_gen: false,
		});
	}

	const mutationOps = sortByIds(operations.filter((op: any) => !op.p));
	for (const op of mutationOps) {
		if (op.a) {
			await adapter.add({
				collection,
				data: decodeCrdt(op.a),
				id_gen: false,
			});
		} else if (op.aa) {
			for (const record of op.aa) {
				await adapter.add({
					collection,
					data: decodeCrdt(record),
					id_gen: false,
				});
			}
		} else if (op.d) {
			const { op: method, d } = op;
			await (adapter as any)[method]({
				collection,
				...decodeCrdt(d),
			});
		}
	}
}
