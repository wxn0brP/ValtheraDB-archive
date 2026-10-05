import { BinManager } from "./index";
import { decodeRecord, encodeRecord, RECORD_FLAG } from "./record";
import { flushMeta } from "./meta";
import { COLLECTION_HEADER_SIZE } from "./static";

export async function optimize(cmp: BinManager) {
	if (!cmp.fd) throw new Error("File not open");
	const collections = [
		...cmp.meta.collections,
	];
	for (const c of collections) {
		if (c.header.deadCount > 0) {
			await compactCollection(cmp, c);
		}
	}
	for (const c of collections) {
		cmp.invalidateRecordCache(c.name);
	}
	const stats = await cmp.fd.stat();
	if (stats.size > cmp.meta.header.fileSize) {
		await cmp.fd.truncate(cmp.meta.header.fileSize);
	}
	await flushMeta(cmp);
}

export async function compactCollection(cmp: BinManager, collection: any) {
	if (!cmp.fd) throw new Error("File not open");
	if (collection.header.used <= COLLECTION_HEADER_SIZE) {
		collection.header.deadCount = 0;
		return;
	}

	const dataLen = collection.header.used - COLLECTION_HEADER_SIZE;
	const buf = Buffer.alloc(dataLen);
	await cmp.fd.read(
		buf,
		0,
		dataLen,
		collection.headerOffset + COLLECTION_HEADER_SIZE,
	);

	const liveRecords: {
		data: Buffer;
		useCrc: boolean;
	}[] = [];
	let cursor = 0;
	while (cursor < buf.length) {
		const rec = decodeRecord(buf, cursor);
		if (!rec) break;
		if (!(rec.flags & RECORD_FLAG.DELETED)) {
			liveRecords.push({
				data: rec.data,
				useCrc: (rec.flags & RECORD_FLAG.CRC) !== 0,
			});
		}
		cursor += rec.totalSize;
	}

	const liveBytes = liveRecords.reduce(
		(sum, r) =>
			sum +
			encodeRecord(r.data, {
				crc: r.useCrc,
			}).length,
		0,
	);
	const newCapacity = Math.max(
		Math.ceil(
			(COLLECTION_HEADER_SIZE + liveBytes + cmp.options.preferredSize) /
				cmp.meta.header.blockSize,
		) * cmp.meta.header.blockSize,
		COLLECTION_HEADER_SIZE + cmp.options.preferredSize,
	);

	const slot = cmp.allocSpace(newCapacity);

	const newHeaderBuf = Buffer.alloc(COLLECTION_HEADER_SIZE, 0);
	newHeaderBuf.writeUInt32LE(liveRecords.length, 0);
	newHeaderBuf.writeUInt32LE(0, 4);
	newHeaderBuf.writeUInt32LE(newCapacity, 8);
	newHeaderBuf.writeUInt32LE(COLLECTION_HEADER_SIZE, 12);
	newHeaderBuf.writeUInt32LE(COLLECTION_HEADER_SIZE, 16);
	newHeaderBuf.writeUInt8(collection.header.flags, 28);
	newHeaderBuf.writeBigUInt64LE(BigInt(Date.now()), 29);
	await cmp.writeAt(slot.offset, newHeaderBuf);

	let off = COLLECTION_HEADER_SIZE;
	for (const r of liveRecords) {
		const rec = encodeRecord(r.data, {
			crc: r.useCrc,
		});
		await cmp.writeAt(slot.offset + off, rec);
		off += rec.length;
	}

	const oldOffset = collection.headerOffset;
	const oldCapacity = collection.header.capacity;
	collection.headerOffset = slot.offset;
	collection.header.capacity = newCapacity;
	collection.header.used = off;
	collection.header.freeOffset = off;
	collection.header.recordCount = liveRecords.length;
	collection.header.deadCount = 0;
	collection.header.lastCompactionTs = Date.now();
	collection.header.indexOffset = 0;
	collection.header.indexLen = 0;

	const tail = oldOffset + oldCapacity;
	if (tail === cmp.meta.header.fileSize) {
		cmp.meta.header.fileSize -= oldCapacity;
	} else {
		cmp.freeSpace(oldOffset, oldCapacity);
	}

	cmp.invalidateRecordCache(collection.name);
	cmp.invalidateIndexCache(collection.name);
}
