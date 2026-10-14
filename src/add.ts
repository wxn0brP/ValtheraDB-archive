import { addId, addIdBulk } from "@wxn0brp/db-core/helpers/addId";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { MongoDbAction } from "./actions";

export async function add(mongo: MongoDbAction, query: VQueryT.Add) {
	const { collection, data } = query;
	const coll = mongo._getCollection(collection);
	const opts = mongo._session
		? {
				session: mongo._session,
			}
		: {};

	if (query.id_gen === false && !data._id) {
		const dataToInsert = {
			...data,
			_vdb_no_id: true,
		};
		await coll.insertOne(dataToInsert, opts);
		return data;
	}

	await addId(query, mongo);

	await coll.insertOne(data, opts);
	return data;
}

export async function bulkAdd(mongo: MongoDbAction, query: VQueryT.BulkAdd) {
	const { collection, datas } = query;
	const coll = mongo._getCollection(collection);
	const opts = mongo._session
		? {
				session: mongo._session,
			}
		: {};

	if (datas.length === 0) return datas;

	if (query.id_gen === false) {
		const dataToInsert = datas.map(data =>
			data._id
				? data
				: {
						...data,
						_vdb_no_id: true,
					},
		);
		await coll.insertMany(dataToInsert, opts);
		return datas;
	}

	await addIdBulk(query, mongo);

	await coll.insertMany(datas, opts);
	return datas;
}
