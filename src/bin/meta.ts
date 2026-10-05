import * as msgpack from "@msgpack/msgpack";
import {
	CollectionHeader,
	decodeCollectionHeader,
	encodeCollectionHeader,
	newCollectionHeader,
} from "./collection-header";
import { FileHeader, decodeHeader, encodeHeader, newHeader } from "./header";
import { SpaceManager, addFreeSlot, allocSlot, newSpace } from "./space";
import { COLLECTION_HEADER_SIZE, HEADER_SIZE } from "./static";
import { readVarint, writeVarint } from "./varint";
import { readData } from "./utils";
import type { BinManager } from "./index";
import type { FileHandle } from "fs/promises";

export interface CollectionRecord {
	name: string;
	headerOffset: number;
	header: CollectionHeader;
}

export interface FileMeta {
	header: FileHeader;
	collections: CollectionRecord[];
	collectionByName: Map<string, CollectionRecord>;
	space: SpaceManager;
}

export function newMeta(blockSize: number, growthFactor: number): FileMeta {
	const header = newHeader(blockSize, growthFactor);
	return {
		header,
		collections: [],
		collectionByName: new Map(),
		space: newSpace(header),
	};
}

export async function loadMeta(cmp: BinManager): Promise<FileMeta> {
	const { fd, options } = cmp;
	const stats = await fd.stat();
	const fileSize = stats.size;

	if (fileSize === 0) {
		return newMeta(options.preferredSize, options.growthFactor);
	}

	if (fileSize < HEADER_SIZE) {
		throw new Error(
			`file too small: ${fileSize} bytes (header requires ${HEADER_SIZE})`,
		);
	}

	const headerBuf = await readData(fd, 0, HEADER_SIZE);
	const header = decodeHeader(headerBuf);
	header.fileSize = fileSize;

	const meta: FileMeta = {
		header,
		collections: [],
		collectionByName: new Map(),
		space: newSpace(header),
	};

	if (header.collectionsLen > 0 && header.collectionsOffset > 0) {
		const payload = await readData(
			fd,
			header.collectionsOffset,
			header.collectionsLen,
		);
		const list = msgpack.decode(payload) as Array<{
			name: string;
			headerOffset: number;
		}>;
		for (const entry of list) {
			const cBuf = await readData(
				fd,
				entry.headerOffset,
				COLLECTION_HEADER_SIZE,
			);
			const cHeader = decodeCollectionHeader(cBuf);
			const record: CollectionRecord = {
				name: entry.name,
				headerOffset: entry.headerOffset,
				header: cHeader,
			};
			meta.collections.push(record);
			meta.collectionByName.set(entry.name, record);
		}
		cmp.collectionsDirty = true;
		for (const c of meta.collections) {
			cmp.dirtyCollections.add(c.name);
		}
	} else {
		cmp.collectionsDirty = true;
	}

	if (header.freeSmallLen > 0 && header.freeSmallOffset > 0) {
		const buf = await readData(fd, header.freeSmallOffset, header.freeSmallLen);
		meta.space.freeLists[0] = parseBucket(buf);
	}
	if (header.freeMediumLen > 0 && header.freeMediumOffset > 0) {
		const buf = await readData(
			fd,
			header.freeMediumOffset,
			header.freeMediumLen,
		);
		meta.space.freeLists[1] = parseBucket(buf);
	}
	if (header.freeLargeLen > 0 && header.freeLargeOffset > 0) {
		const buf = await readData(fd, header.freeLargeOffset, header.freeLargeLen);
		meta.space.freeLists[2] = parseBucket(buf);
	}

	return meta;
}

function parseBucket(buf: Buffer): {
	offset: number;
	size: number;
}[] {
	const out: {
		offset: number;
		size: number;
	}[] = [];
	if (buf.length < 4) return out;
	const count = buf.readUInt32LE(0);
	let off = 4;
	for (let i = 0; i < count; i++) {
		const o = readVarint(buf, off);
		off += o.size;
		const s = readVarint(buf, off);
		off += s.size;
		out.push({
			offset: o.value,
			size: s.value,
		});
	}
	return out;
}

export function findCollection(
	cmp: BinManager,
	name: string,
): CollectionRecord | null {
	return cmp.meta.collectionByName.get(name) || null;
}

export async function flushMeta(cmp: BinManager) {
	const { fd, meta } = cmp;
	const { header } = meta;

	if (cmp.collectionsDirty) {
		const list = meta.collections.map(c => ({
			name: c.name,
			headerOffset: c.headerOffset,
		}));
		const payload = Buffer.from(msgpack.encode(list));
		header.collectionsLen = payload.length;
		if (
			header.collectionsOffset === HEADER_SIZE ||
			header.collectionsOffset === 0
		) {
			const slot = allocSlot(meta.space, payload.length);
			header.collectionsOffset = slot.offset;
		}
		await fd.write(payload, 0, payload.length, header.collectionsOffset);
		cmp.collectionsDirty = false;
	}

	const buckets: Buffer[] = [];
	for (let b = 0; b < 3; b++) {
		buckets.push(serializeBucket(meta.space.freeLists[b]));
	}
	const totalBucketLen = buckets.reduce((s, b) => s + b.length, 0);
	if (totalBucketLen > 0) {
		const slot = allocSlot(meta.space, totalBucketLen);
		let off = slot.offset;
		for (let b = 0; b < 3; b++) {
			if (buckets[b].length > 0) {
				if (b === 0) header.freeSmallOffset = off;
				else if (b === 1) header.freeMediumOffset = off;
				else header.freeLargeOffset = off;
				await fd.write(buckets[b], 0, buckets[b].length, off);
				off += buckets[b].length;
			} else {
				if (b === 0) header.freeSmallOffset = 0;
				else if (b === 1) header.freeMediumOffset = 0;
				else header.freeLargeOffset = 0;
			}
		}
		header.freeSmallLen = buckets[0].length;
		header.freeMediumLen = buckets[1].length;
		header.freeLargeLen = buckets[2].length;
	} else {
		header.freeSmallOffset = 0;
		header.freeSmallLen = 0;
		header.freeMediumOffset = 0;
		header.freeMediumLen = 0;
		header.freeLargeOffset = 0;
		header.freeLargeLen = 0;
	}

	for (const c of meta.collections) {
		if (cmp.dirtyCollections.has(c.name)) {
			const buf = encodeCollectionHeader(c.header);
			await fd.write(buf, 0, buf.length, c.headerOffset);
		}
	}
	cmp.dirtyCollections.clear();

	header.fileSize = meta.space.header.fileSize;
	const headerBuf = encodeHeader(header);
	await fd.write(headerBuf, 0, headerBuf.length, 0);
}

function serializeBucket(
	list: {
		offset: number;
		size: number;
	}[],
): Buffer {
	if (list.length === 0) return Buffer.alloc(0);
	const buf = Buffer.alloc(4 + list.length * 10);
	buf.writeUInt32LE(list.length, 0);
	let off = 4;
	for (const slot of list) {
		off = writeVarint(slot.offset, buf, off);
		off = writeVarint(slot.size, buf, off);
	}
	return buf.subarray(0, off);
}

export { newCollectionHeader, addFreeSlot };
