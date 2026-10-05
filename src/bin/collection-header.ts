import { crc32 } from "./crc";
import { COLLECTION_FLAG, COLLECTION_HEADER_SIZE } from "./static";

export interface CollectionHeader {
	recordCount: number;
	deadCount: number;
	capacity: number;
	used: number;
	freeOffset: number;
	indexOffset: number;
	indexLen: number;
	flags: number;
	lastCompactionTs: number;
}

export function encodeCollectionHeader(h: CollectionHeader): Buffer {
	const buf = Buffer.alloc(COLLECTION_HEADER_SIZE);

	buf.writeUInt32LE(h.recordCount >>> 0, 0);
	buf.writeUInt32LE(h.deadCount >>> 0, 4);
	buf.writeUInt32LE(h.capacity >>> 0, 8);
	buf.writeUInt32LE(h.used >>> 0, 12);
	buf.writeUInt32LE(h.freeOffset >>> 0, 16);
	buf.writeUInt32LE(h.indexOffset >>> 0, 20);
	buf.writeUInt32LE(h.indexLen >>> 0, 24);
	buf.writeUInt8(h.flags, 28);
	buf.writeBigUInt64LE(BigInt(h.lastCompactionTs), 29);

	const usedLen = 37;
	const crc = crc32(buf.subarray(0, usedLen));
	buf.writeUInt32LE(crc, usedLen);

	return buf;
}

export function decodeCollectionHeader(buf: Buffer): CollectionHeader {
	const usedLen = 37;
	const storedCrc = buf.readUInt32LE(usedLen);
	const computedCrc = crc32(buf.subarray(0, usedLen));
	if (storedCrc !== 0 && storedCrc !== computedCrc) {
		throw new Error(
			`collection header CRC mismatch: ${storedCrc.toString(16)} != ${computedCrc.toString(16)}`,
		);
	}

	return {
		recordCount: buf.readUInt32LE(0),
		deadCount: buf.readUInt32LE(4),
		capacity: buf.readUInt32LE(8),
		used: buf.readUInt32LE(12),
		freeOffset: buf.readUInt32LE(16),
		indexOffset: buf.readUInt32LE(20),
		indexLen: buf.readUInt32LE(24),
		flags: buf.readUInt8(28),
		lastCompactionTs: Number(buf.readBigUInt64LE(29)),
	};
}

export function newCollectionHeader(
	capacity: number,
	flags = 0,
): CollectionHeader {
	return {
		recordCount: 0,
		deadCount: 0,
		capacity,
		used: COLLECTION_HEADER_SIZE,
		freeOffset: COLLECTION_HEADER_SIZE,
		indexOffset: 0,
		indexLen: 0,
		flags,
		lastCompactionTs: 0,
	};
}

export function hasIndex(h: CollectionHeader) {
	return (h.flags & COLLECTION_FLAG.INDEXED) !== 0;
}
