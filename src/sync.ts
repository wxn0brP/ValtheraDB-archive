import type { ValtheraClass } from "@wxn0brp/db-core";
import { rebuild } from "./rebuild";
import { collectionPrefix } from "./static";
import type { SyncOpts, SyncResult } from "./types";

async function getLogIds(db: ValtheraClass, logCol: string) {
	const data = await db.find({
		collection: logCol,
		search: {},
		findOpts: {
			select: [
				"_id",
			],
		},
	});
	return data.map((d: any) => d._id);
}

export async function sync(
	my: ValtheraClass,
	other: ValtheraClass,
	collection: string,
	opts: boolean | SyncOpts = {},
	prefix: string = collectionPrefix,
): Promise<SyncResult> {
	const _opts: SyncOpts =
		typeof opts === "boolean"
			? {
					rebuild: opts,
				}
			: opts;
	const logCol = prefix + "/" + collection;

	const myIds = await getLogIds(my, logCol);
	const otherIds = await getLogIds(other, logCol);
	const myIdSet = new Set(myIds);

	const missing = otherIds.filter(id => !myIdSet.has(id));

	if (missing.length === 0) {
		if (_opts.rebuild) await rebuild(my, collection, prefix);
		return {
			collection,
			copied: 0,
			changed: false,
			rebuild: !!_opts.rebuild,
		};
	}

	const getData = await other.find({
		collection: logCol,
		search: {
			$in: {
				_id: missing,
			},
		},
	});

	for (const data of getData) {
		await my.adapter.add({
			collection: logCol,
			data,
			id_gen: false,
		});
	}

	if (_opts.rebuild) await rebuild(my, collection, prefix);

	return {
		collection,
		copied: getData.length,
		changed: getData.length > 0,
		rebuild: !!_opts.rebuild,
	};
}
