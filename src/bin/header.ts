import { crc32 } from "./crc";
import { FREE_BUCKET, HEADER_SIZE, MAGIC, VERSION } from "./static";

export interface FileHeader {
	collectionsOffset: number;
	collectionsLen: number;
	freeSmallOffset: number;
	freeSmallLen: number;
	freeMediumOffset: number;
	freeMediumLen: number;
	freeLargeOffset: number;
	freeLargeLen: number;
	blockSize: number;
	growthFactor: number;
	fileSize: number;
	flags: number;
}

export function encodeHeader(meta: FileHeader): Buffer {
	const buf = Buffer.alloc(HEADER_SIZE);

	buf.writeUInt32LE(MAGIC, 0);
	buf.writeUInt32LE(VERSION, 4);
	buf.writeUInt8(0, 8);
	buf.writeUInt8(meta.flags, 9);
	buf.writeUInt32LE(meta.collectionsOffset, 10);
	buf.writeUInt32LE(meta.collectionsLen, 14);
	buf.writeUInt32LE(meta.freeSmallOffset, 18);
	buf.writeUInt32LE(meta.freeSmallLen, 22);
	buf.writeUInt32LE(meta.freeMediumOffset, 26);
	buf.writeUInt32LE(meta.freeMediumLen, 30);
	buf.writeUInt32LE(meta.freeLargeOffset, 34);
	buf.writeUInt32LE(meta.freeLargeLen, 38);
	buf.writeUInt32LE(meta.blockSize, 42);
	buf.writeFloatLE(meta.growthFactor, 46);
	buf.writeBigUInt64LE(BigInt(meta.fileSize), 50);

	const usedLen = 58;
	const crc = crc32(buf.subarray(0, usedLen));
	buf.writeUInt32LE(crc, usedLen);

	return buf;
}

export function decodeHeader(buf: Buffer): FileHeader {
	const magic = buf.readUInt32LE(0);
	if (magic !== MAGIC) {
		throw new Error(`invalid file magic: 0x${magic.toString(16)}`);
	}
	const version = buf.readUInt32LE(4);
	if (version !== VERSION) {
		throw new Error(
			`unsupported file version ${version} (expected ${VERSION})`,
		);
	}

	const usedLen = 58;
	const storedCrc = buf.readUInt32LE(usedLen);
	const computedCrc = crc32(buf.subarray(0, usedLen));
	if (storedCrc !== 0 && storedCrc !== computedCrc) {
		throw new Error(
			`file header CRC mismatch: stored ${storedCrc.toString(16)} != computed ${computedCrc.toString(16)}`,
		);
	}

	return {
		collectionsOffset: buf.readUInt32LE(10),
		collectionsLen: buf.readUInt32LE(14),
		freeSmallOffset: buf.readUInt32LE(18),
		freeSmallLen: buf.readUInt32LE(22),
		freeMediumOffset: buf.readUInt32LE(26),
		freeMediumLen: buf.readUInt32LE(30),
		freeLargeOffset: buf.readUInt32LE(34),
		freeLargeLen: buf.readUInt32LE(38),
		blockSize: buf.readUInt32LE(42),
		growthFactor: buf.readFloatLE(46),
		fileSize: Number(buf.readBigUInt64LE(50)),
		flags: buf.readUInt8(9),
	};
}

export function newHeader(blockSize: number, growthFactor: number): FileHeader {
	return {
		collectionsOffset: HEADER_SIZE,
		collectionsLen: 0,
		freeSmallOffset: 0,
		freeSmallLen: 0,
		freeMediumOffset: 0,
		freeMediumLen: 0,
		freeLargeOffset: 0,
		freeLargeLen: 0,
		blockSize,
		growthFactor,
		fileSize: HEADER_SIZE,
		flags: 0,
	};
}

export function bucketIndex(size: number) {
	if (size <= FREE_BUCKET.SMALL_MAX) return FREE_BUCKET.SMALL;
	if (size <= FREE_BUCKET.MEDIUM_MAX) return FREE_BUCKET.MEDIUM;
	return FREE_BUCKET.LARGE;
}
