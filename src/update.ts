import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { MongoDbAdapter } from "./adapter";
import { cleanDocs } from "./utils";
import {
	applyJsUpdater,
	assertNumericOps,
	isEmptyUpdate,
	needsJsUpdater,
	needsNumericCheck,
	resolveSearch,
	translateUpdater,
} from "./utils/update";

export async function update(mongo: MongoDbAdapter, query: VQueryT.Update) {
	const { collection, search, updater } = query;
	const coll = mongo._getCollection(collection);
	const opts = mongo._session
		? {
				session: mongo._session,
			}
		: {};

	const { filter, allData } = await resolveSearch(search, coll, opts);

	if (needsJsUpdater(updater)) {
		const docs =
			allData !== null
				? allData
				: cleanDocs(await coll.find(filter!, opts).toArray());
		for (const doc of docs) {
			applyJsUpdater(doc, updater);
			await coll.replaceOne(
				{
					_id: doc._id,
				},
				doc,
				opts,
			);
		}
		return docs;
	}

	if (allData !== null) {
		assertNumericOps(allData, updater);
		const mongoUpdate = translateUpdater(updater);
		if (!isEmptyUpdate(mongoUpdate)) {
			for (const doc of allData) {
				await coll.updateOne(
					{
						_id: doc._id,
					},
					mongoUpdate,
					opts,
				);
			}
		}
		return allData;
	}

	const mongoUpdate = translateUpdater(updater);
	if (!isEmptyUpdate(mongoUpdate)) {
		if (needsNumericCheck(updater)) {
			const docs = await coll.find(filter!, opts).toArray();
			assertNumericOps(docs, updater);
		}
		await coll.updateMany(filter!, mongoUpdate, opts);
		const result = await coll.find(filter, opts).toArray();
		return cleanDocs(result);
	}
	const emptyResult = await coll.find(filter, opts).toArray();
	return cleanDocs(emptyResult);
}

export async function updateOne(mongo: MongoDbAdapter, query: VQueryT.Update) {
	const { collection, search, updater } = query;
	const coll = mongo._getCollection(collection);
	const opts = mongo._session
		? {
				session: mongo._session,
			}
		: {};

	const { filter, allData } = await resolveSearch(search, coll, opts);

	if (needsJsUpdater(updater)) {
		const doc =
			allData !== null
				? (allData[0] ?? null)
				: await coll.findOne(filter, opts);
		if (!doc) return null;
		applyJsUpdater(doc, updater);
		await coll.replaceOne(
			{
				_id: doc._id,
			},
			doc,
			opts,
		);
		return cleanDocs(doc) as DataInternal;
	}

	if (allData !== null) {
		const doc = allData[0] ?? null;
		if (!doc) return null;
		assertNumericOps(
			[
				doc,
			],
			updater,
		);
		const mongoUpdate = translateUpdater(updater);
		if (!isEmptyUpdate(mongoUpdate)) {
			await coll.updateOne(
				{
					_id: doc._id,
				},
				mongoUpdate,
				opts,
			);
		}
		return doc;
	}

	const mongoUpdate = translateUpdater(updater);
	const result = await coll.findOne(filter, opts);
	if (!result) return null;
	assertNumericOps(
		[
			result,
		],
		updater,
	);
	if (!isEmptyUpdate(mongoUpdate)) {
		await coll.updateOne(filter, mongoUpdate, opts);
		const updated = await coll.findOne(filter, opts);
		return cleanDocs(updated) as DataInternal | null;
	}
	return cleanDocs(result) as DataInternal | null;
}
