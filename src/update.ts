import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { MongoDbAction } from "./actions";
import { cleanDocs } from "./utils";
import { isEmptyUpdate, resolveSearch, translateUpdater } from "./utils/update";

export async function update(mongo: MongoDbAction, query: VQueryT.Update) {
	const { collection, search, updater, context } = query;
	const coll = mongo._getCollection(collection);
	const opts = mongo._session
		? {
				session: mongo._session,
			}
		: {};

	if (typeof updater === "function") {
		const { filter, allData } = await resolveSearch(
			search,
			coll,
			context,
			opts,
		);
		const toUpdate = allData ?? (await coll.find(filter, opts).toArray());
		const updated = [];
		for (const doc of cleanDocs(toUpdate)) {
			const mod = updater(doc, context);
			if (mod) {
				await coll.updateOne(
					{
						_id: doc._id,
					},
					{
						$set: mod,
					},
					opts,
				);
				Object.assign(doc, mod);
			}
			updated.push(doc);
		}
		return updated;
	}

	const { filter, allData } = await resolveSearch(search, coll, context, opts);
	if (allData !== null) {
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
		await coll.updateMany(filter!, mongoUpdate, opts);
		const result = await coll.find(filter, opts).toArray();
		return cleanDocs(result);
	}
	const emptyResult = await coll.find(filter, opts).toArray();
	return cleanDocs(emptyResult);
}

export async function updateOne(mongo: MongoDbAction, query: VQueryT.Update) {
	const { collection, search, updater, context } = query;
	const coll = mongo._getCollection(collection);
	const opts = mongo._session
		? {
				session: mongo._session,
			}
		: {};

	if (typeof updater === "function") {
		const { filter, allData } = await resolveSearch(
			search,
			coll,
			context,
			opts,
		);

		let doc: any;
		if (allData !== null) {
			doc = allData[0] ?? null;
		} else {
			doc = await coll.findOne(filter, opts);
		}

		if (!doc) return null;
		const mod = updater(doc, context);
		if (mod) {
			await coll.updateOne(
				{
					_id: doc._id,
				},
				{
					$set: mod,
				},
				opts,
			);
			Object.assign(doc, mod);
		}
		return cleanDocs(doc) as DataInternal | null;
	}

	const { filter, allData } = await resolveSearch(search, coll, context, opts);

	if (allData !== null) {
		const doc = allData[0] ?? null;
		if (!doc) return null;
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
	if (!isEmptyUpdate(mongoUpdate)) {
		await coll.updateOne(filter, mongoUpdate, opts);
		const updated = await coll.findOne(filter, opts);
		return cleanDocs(updated) as DataInternal | null;
	}
	return cleanDocs(result) as DataInternal | null;
}
