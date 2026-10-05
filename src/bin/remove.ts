import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { matchObj } from "@wxn0brp/db-core/utils/process";
import { BinManager } from "./index";
import { flushMeta } from "./meta";
import { compactCollection } from "./optimize";
import { decodeRecord, RECORD_FLAG } from "./record";
import { COLLECTION_HEADER_SIZE, COMPACTION_DEAD_RATIO } from "./static";

export async function remove(
	cmp: BinManager,
	config: VQueryT.Remove,
	one: boolean,
): Promise<DataInternal[]> {
	if (!cmp.fd) throw new Error("File not open");

	const collection = cmp.meta.collectionByName.get(config.collection);
	if (!collection) return [];

	const removed: DataInternal[] = [];

	if (collection.header.used <= COLLECTION_HEADER_SIZE) return removed;

	const dataLen = collection.header.used - COLLECTION_HEADER_SIZE;
	const buf = Buffer.alloc(dataLen);
	await cmp.fd.read(
		buf,
		0,
		dataLen,
		collection.headerOffset + COLLECTION_HEADER_SIZE,
	);

	const cache = cmp.getRecordCache(collection.name);
	let cursor = 0;
	while (cursor < buf.length) {
		const rec = decodeRecord(buf, cursor);
		if (!rec) break;

		if (rec.flags & RECORD_FLAG.DELETED) {
			cursor += rec.totalSize;
			continue;
		}

		const recordOffset =
			collection.headerOffset + COLLECTION_HEADER_SIZE + cursor;
		const obj = await cmp.options.format.decode(rec.data, config.collection);
		const match = matchObj(config, obj);

		if (match) {
			const flagByte = Buffer.alloc(1);
			flagByte[0] = rec.flags | RECORD_FLAG.DELETED;
			await cmp.writeAt(recordOffset, flagByte);

			collection.header.deadCount += 1;
			if (cache) cache.delete(recordOffset);

			removed.push(obj);

			if (one) break;
		}

		cursor += rec.totalSize;
	}

	if (removed.length === 0) return removed;

	cmp.markCollectionDirty(collection.name);

	if (
		collection.header.recordCount > 0 &&
		collection.header.deadCount / collection.header.recordCount >
			COMPACTION_DEAD_RATIO
	) {
		await compactCollection(cmp, collection);
	}

	await flushMeta(cmp);
	return removed;
}
