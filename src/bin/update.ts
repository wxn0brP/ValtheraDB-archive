import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { matchObj, updateObj } from "@wxn0brp/db-core/utils/process";
import { BinManager } from "./index";
import { flushMeta } from "./meta";
import { compactCollection } from "./optimize";
import { decodeRecord, encodeRecord, RECORD_FLAG } from "./record";
import { COLLECTION_HEADER_SIZE, COMPACTION_DEAD_RATIO } from "./static";

export async function update(
	cmp: BinManager,
	config: VQueryT.Update,
	one: boolean,
): Promise<DataInternal[]> {
	if (!cmp.fd) throw new Error("File not open");

	if (
		typeof config.updater === "object" &&
		config.updater !== null &&
		!Array.isArray(config.updater) &&
		Object.keys(config.updater).length === 0
	) {
		return [];
	}

	const collection = cmp.meta.collectionByName.get(config.collection);
	if (!collection) return [];

	const updated: DataInternal[] = [];

	if (collection.header.used <= COLLECTION_HEADER_SIZE) return updated;

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

		if (!match) {
			cursor += rec.totalSize;
			continue;
		}

		if (one && updated.length > 0) {
			cursor += rec.totalSize;
			continue;
		}

		const updatedObj = updateObj(config, obj);
		const encoded = Buffer.from(
			await cmp.options.format.encode(updatedObj, config.collection),
		);
		const newRec = encodeRecord(encoded, {
			crc: (rec.flags & RECORD_FLAG.CRC) !== 0,
		});

		if (newRec.length <= rec.totalSize) {
			const fullRecord = Buffer.alloc(rec.totalSize, 0);
			newRec.copy(fullRecord, 0);
			await cmp.writeAt(recordOffset, fullRecord);
			if (cache) cache.set(recordOffset, encoded);
		} else {
			const flagByte = Buffer.alloc(1);
			flagByte[0] = rec.flags | RECORD_FLAG.DELETED;
			await cmp.writeAt(recordOffset, flagByte);
			if (cache) cache.delete(recordOffset);

			await appendNewRecord(
				cmp,
				collection,
				encoded,
				(rec.flags & RECORD_FLAG.CRC) !== 0,
				cache,
			);
			collection.header.deadCount += 1;
		}

		updated.push(updatedObj);
		cursor += rec.totalSize;
	}

	if (updated.length === 0) return updated;

	cmp.markCollectionDirty(collection.name);

	if (
		collection.header.recordCount > 0 &&
		collection.header.deadCount / collection.header.recordCount >
			COMPACTION_DEAD_RATIO
	) {
		await compactCollection(cmp, collection);
	}

	await flushMeta(cmp);
	return updated;
}

async function appendNewRecord(
	cmp: BinManager,
	collection: {
		headerOffset: number;
		header: {
			capacity: number;
			used: number;
			freeOffset: number;
			recordCount: number;
		};
	},
	encoded: Buffer,
	useCrc: boolean,
	cache: Map<number, Buffer> | null,
) {
	if (
		collection.header.freeOffset + encoded.length + 8 >
		collection.header.capacity
	) {
		await growForAppend(cmp, collection, encoded.length + 8);
	}
	const newRec = encodeRecord(encoded, {
		crc: useCrc,
	});
	const recordOffset = collection.headerOffset + collection.header.freeOffset;
	await cmp.writeAt(recordOffset, newRec);
	if (cache) cache.set(recordOffset, encoded);

	collection.header.freeOffset += newRec.length;
	collection.header.used += newRec.length;
	collection.header.recordCount += 1;
}

async function growForAppend(
	cmp: BinManager,
	collection: {
		headerOffset: number;
		header: {
			capacity: number;
			used: number;
			freeOffset: number;
		};
	},
	need: number,
) {
	const newCapacity = Math.max(
		collection.header.capacity * Math.max(2, cmp.options.growthFactor),
		collection.header.used + need + cmp.options.preferredSize,
	);
	const aligned =
		Math.ceil(newCapacity / cmp.meta.header.blockSize) *
		cmp.meta.header.blockSize;

	const slot = cmp.allocSpace(aligned);
	const oldBuf = Buffer.alloc(collection.header.used);
	await cmp.fd.read(oldBuf, 0, collection.header.used, collection.headerOffset);
	await cmp.writeAt(slot.offset, oldBuf);

	const tail = collection.headerOffset + collection.header.used;
	if (tail === cmp.meta.header.fileSize) {
		cmp.meta.header.fileSize -= collection.header.capacity;
	} else {
		cmp.freeSpace(collection.headerOffset, collection.header.capacity);
	}

	collection.headerOffset = slot.offset;
	collection.header.capacity = aligned;
	collection.header.used = oldBuf.length;
	collection.header.freeOffset = oldBuf.length;
}
