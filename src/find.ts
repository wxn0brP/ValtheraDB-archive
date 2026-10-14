import { VQueryT } from "@wxn0brp/db-core/types/query";
import { findUtil } from "@wxn0brp/db-core/utils/action";
import { hasFieldsAdvanced } from "@wxn0brp/db-core/utils/hasFieldsAdvanced";
import { MongoDbAction } from "./actions";
import { cleanDocs, needsJsFallback, translateQuery } from "./utils";
import { nativeAggregate } from "./utils/aggregate";

export async function find(mongo: MongoDbAction, query: VQueryT.Find) {
	const { collection, search, dbFindOpts = {}, findOpts, context } = query;
	const coll = mongo._getCollection(collection);
	const opts = mongo._session
		? {
				session: mongo._session,
			}
		: {};

	const {
		reverse = false,
		offset = 0,
		limit = -1,
		sortBy,
		sortAsc = true,
		min,
		max,
		avg,
		groupBy,
		count,
		sum,
		distinct,
	} = dbFindOpts;

	const needsAggregation =
		min || max || avg || groupBy || count || sum || distinct;
	const searchIsFunc = typeof search === "function";
	const needsNativeFallback = !searchIsFunc && !needsJsFallback(search);
	const canUseNative =
		needsNativeFallback &&
		!needsAggregation &&
		sortBy !== "random()" &&
		!(reverse && !sortBy);

	if (canUseNative) {
		const mongoQuery = translateQuery(search);
		let cursor = coll.find(mongoQuery, opts);
		if (sortBy) {
			if (Array.isArray(sortBy)) {
				const sortObj: Record<string, 1 | -1> = {};
				for (const s of sortBy) {
					sortObj[s.field as string] = s.asc === false ? -1 : 1;
				}
				cursor = cursor.sort(sortObj);
			} else {
				cursor = cursor.sort({
					[sortBy]: sortAsc ? 1 : -1,
				});
			}
		}
		if (offset > 0) cursor = cursor.skip(offset);
		if (limit === 0) return [];
		if (limit !== -1) cursor = cursor.limit(limit);
		const results = await cursor.toArray();
		return mongo._applyFindOpts(cleanDocs(results), findOpts);
	}

	if (needsAggregation && needsNativeFallback) {
		const mongoQuery = translateQuery(search);
		const results = await nativeAggregate(coll, mongoQuery, dbFindOpts, opts);
		return mongo._applyFindOpts(results, findOpts);
	}

	if (searchIsFunc) {
		const all = await coll.find({}, opts).toArray();
		const filtered = cleanDocs(all).filter((d: any) => search(d, context));
		const results = await findUtil(query, filtered, [
			"",
		]);
		return mongo._applyFindOpts(results, findOpts);
	}

	if (needsJsFallback(search)) {
		const all = await coll.find({}, opts).toArray();
		const allData = cleanDocs(all).filter((d: any) =>
			hasFieldsAdvanced(d, search),
		);
		const results = await findUtil(query, allData, [
			"",
		]);
		return mongo._applyFindOpts(results, findOpts);
	}

	const mongoQuery = translateQuery(search);
	const results = await coll.find(mongoQuery, opts).toArray();
	const clean = cleanDocs(results);
	const found = await findUtil(query, clean, [
		"",
	]);
	return mongo._applyFindOpts(found, findOpts);
}

export async function findOne(mongo: MongoDbAction, query: VQueryT.FindOne) {
	const { collection, search, findOpts, context } = query;
	const coll = mongo._getCollection(collection);
	const opts = mongo._session
		? {
				session: mongo._session,
			}
		: {};

	if (typeof search === "function") {
		const all = await coll.find({}, opts).toArray();
		const found = cleanDocs(all).find((d: any) => search(d, context));
		return mongo._applyFindOpts(found ?? null, findOpts);
	}

	if (needsJsFallback(search)) {
		const all = await coll.find({}, opts).toArray();
		const found = cleanDocs(all).find((d: any) => hasFieldsAdvanced(d, search));
		return mongo._applyFindOpts(found ?? null, findOpts);
	}

	const mongoQuery = translateQuery(search);
	const result = await coll.findOne(mongoQuery, opts);
	return mongo._applyFindOpts(cleanDocs(result), findOpts);
}
