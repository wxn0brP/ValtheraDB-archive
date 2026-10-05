import { VQueryT } from "@wxn0brp/db-core/types/query";
import {
	insert as indexInsert,
	mergeDelta,
	needsMerge,
	serialize,
} from "./idindex";
import { BinManager } from "./index";
import { flushMeta } from "./meta";
import { encodeRecord } from "./record";
import { COLLECTION_FLAG } from "./static";

export async function add(cmp: BinManager, config: VQueryT.Add) {
	const { data } = config;
	if (!cmp.fd) throw new Error("File not open");

	const collection = cmp.meta.collectionByName.get(config.collection);
	if (!collection) throw new Error(`collection ${config.collection} not found`);

	const encoded = Buffer.from(
		await cmp.options.format.encode(data, config.collection),
	);
	const useCrc =
		(collection.header.flags & COLLECTION_FLAG.CRC) !== 0 ||
		cmp.options.recordCrc;
	const rec = encodeRecord(encoded, {
		crc: useCrc,
	});

	const needGrow =
		collection.header.used + rec.length > collection.header.capacity;
	if (needGrow) {
		await growCollection(cmp, collection, rec.length);
	}

	const recordOffset = collection.headerOffset + collection.header.freeOffset;
	await cmp.writeAt(recordOffset, rec);

	collection.header.freeOffset += rec.length;
	collection.header.used += rec.length;
	collection.header.recordCount += 1;
	cmp.markCollectionDirty(collection.name);

	if ((collection.header.flags & COLLECTION_FLAG.INDEXED) !== 0) {
		const id = (data as any)._id;
		if (id !== undefined && id !== null) {
			const index = await cmp.getOrLoadIndex(collection.name);
			if (index && indexInsert(index, String(id), recordOffset)) {
				cmp.markIndexDirty(collection.name);
				if (needsMerge(index)) {
					mergeDelta(index);
					await writeIndex(cmp, collection, index);
				}
			}
		}
	}

	await flushMeta(cmp);
}

async function growCollection(
	cmp: BinManager,
	collection: {
		name?: string;
		headerOffset: number;
		header: {
			capacity: number;
			used: number;
			freeOffset: number;
			indexOffset?: number;
			indexLen?: number;
		};
	},
	needExtra: number,
) {
	const newCapacity = Math.max(
		collection.header.capacity * Math.max(2, cmp.options.growthFactor),
		collection.header.used + needExtra + cmp.options.preferredSize,
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

	if (collection.name) cmp.invalidateRecordCache(collection.name);

	if (collection.header.indexOffset !== 0) {
		collection.header.indexOffset = 0;
		collection.header.indexLen = 0;
	}
}

async function writeIndex(
	cmp: BinManager,
	collection: {
		name: string;
		headerOffset: number;
		header: {
			indexOffset: number;
			indexLen: number;
		};
	},
	index: any,
) {
	const buf = serialize(index);
	const newLen = buf.length;
	const oldOffset = collection.header.indexOffset;
	const oldLen = collection.header.indexLen;

	const aligned =
		Math.ceil(newLen / cmp.meta.header.blockSize) * cmp.meta.header.blockSize;
	const slot = cmp.allocSpace(aligned);
	await cmp.writeAt(slot.offset, buf);
	if (aligned > newLen) {
		await cmp.writeAt(slot.offset + newLen, Buffer.alloc(aligned - newLen, 0));
	}

	collection.header.indexOffset = slot.offset - collection.headerOffset;
	collection.header.indexLen = newLen;

	if (oldOffset > 0 && oldLen > 0) {
		cmp.freeSpace(
			collection.headerOffset + oldOffset,
			Math.max(oldLen, aligned),
		);
	}
	cmp.invalidateRecordCache(collection.name);
}
