import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { MongoDbAction } from "./actions";
import { cleanDocs } from "./utils";
import { resolveSearch } from "./utils/update";

export async function remove(mongo: MongoDbAction, query: VQueryT.Remove) {
	const { collection, search, context } = query;
	const coll = mongo._getCollection(collection);
	const opts = mongo._session
		? {
				session: mongo._session,
			}
		: {};

	const { filter, allData } = await resolveSearch(search, coll, context, opts);

	if (allData !== null) {
		for (const doc of allData) {
			await coll.deleteOne(
				{
					_id: doc._id,
				},
				opts,
			);
		}
		return allData;
	}

	const result = await coll.find(filter, opts).toArray();
	await coll.deleteMany(filter, opts);
	return cleanDocs(result) as DataInternal[];
}

export async function removeOne(mongo: MongoDbAction, query: VQueryT.Remove) {
	const { collection, search, context } = query;
	const coll = mongo._getCollection(collection);
	const opts = mongo._session
		? {
				session: mongo._session,
			}
		: {};

	const { filter, allData } = await resolveSearch(search, coll, context, opts);

	if (allData !== null) {
		const doc = allData[0] ?? null;
		if (doc)
			await coll.deleteOne(
				{
					_id: doc._id,
				},
				opts,
			);
		return doc;
	}

	const result = await coll.findOne(filter, opts);
	if (result) await coll.deleteOne(filter, opts);
	return cleanDocs(result) as DataInternal | null;
}
