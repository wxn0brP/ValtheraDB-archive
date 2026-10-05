import { DataInternal } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { findObj } from "@wxn0brp/db-core/utils/process";
import { BinManager } from "./index";
import { decodeRecord, RECORD_FLAG } from "./record";
import { COLLECTION_FLAG } from "./static";
import { COLLECTION_HEADER_SIZE } from "./static";
import { lookup as indexLookup } from "./idindex";
import { readAt, readData } from "./utils";

const READ_HEADER_MAX = 6;

export async function find(
	cmp: BinManager,
	config: VQueryT.Find,
): Promise<DataInternal[]> {
	if (!cmp.fd) throw new Error("File not open");

	const collection = cmp.meta.collectionByName.get(config.collection);
	if (!collection) return [];

	if (
		(collection.header.flags & COLLECTION_FLAG.INDEXED) !== 0 &&
		isIdOnlySearch(config)
	) {
		return await findByIdScan(cmp, collection, config);
	}

	return await findAll(cmp, collection, config);
}

export async function findOne(
	cmp: BinManager,
	config: VQueryT.FindOne,
): Promise<DataInternal | null> {
	if (!cmp.fd) throw new Error("File not open");

	const collection = cmp.meta.collectionByName.get(config.collection);
	if (!collection) return null;

	if (
		(collection.header.flags & COLLECTION_FLAG.INDEXED) !== 0 &&
		isIdOnlySearch(config)
	) {
		const id = String((config.search as any)._id);
		const index = await cmp.getOrLoadIndex(collection.name);
		if (!index) return null;
		const offset = indexLookup(index, id);
		if (offset === null) return null;

		const data = await readRecordPayload(cmp, collection, offset);
		if (!data) return null;
		const obj = await cmp.options.format.decode(data, config.collection);
		return findObj(config, obj);
	}

	const items = await findAll(cmp, collection, config);
	return items.length ? items[0] : null;
}

async function findAll(
	cmp: BinManager,
	collection: any,
	config: VQueryT.Find,
): Promise<DataInternal[]> {
	if (collection.header.used <= COLLECTION_HEADER_SIZE) return [];

	const dataLen = collection.header.used - COLLECTION_HEADER_SIZE;
	const buf = Buffer.alloc(dataLen);
	await readData(
		cmp.fd,
		collection.headerOffset + COLLECTION_HEADER_SIZE,
		dataLen,
	).then(b => b.copy(buf));

	const results: DataInternal[] = [];
	let cursor = 0;
	while (cursor < buf.length) {
		const rec = decodeRecord(buf, cursor);
		if (!rec) break;
		if (!(rec.flags & RECORD_FLAG.DELETED)) {
			try {
				const obj = await cmp.options.format.decode(
					rec.data,
					config.collection,
				);
				const res = findObj(config, obj);
				if (res) results.push(res);
			} catch (err) {
				if (rec.flags & RECORD_FLAG.CRC) {
					throw err;
				}
			}
		}
		cursor += rec.totalSize;
	}
	return results;
}

async function findByIdScan(
	cmp: BinManager,
	collection: any,
	config: VQueryT.Find,
): Promise<DataInternal[]> {
	const index = await cmp.getOrLoadIndex(collection.name);
	if (!index || index.base.length + index.delta.length === 0) return [];
	const search = (config.search || {}) as Record<string, any>;
	const wantId = search._id !== undefined ? String(search._id) : null;

	const targets: number[] = [];
	const all = [
		...index.base,
		...index.delta,
	];
	for (const entry of all) {
		if (wantId !== null && entry.id !== wantId) continue;
		targets.push(entry.offset);
	}

	if (targets.length === 0) return [];

	const payloads = await Promise.all(
		targets.map(o => readRecordPayload(cmp, collection, o)),
	);

	const results: DataInternal[] = [];
	for (const data of payloads) {
		if (!data) continue;
		const obj = await cmp.options.format.decode(data, config.collection);
		const res = findObj(config, obj);
		if (res) results.push(res);
	}
	return results;
}

async function readRecordPayload(
	cmp: BinManager,
	collection: any,
	recordOffset: number,
): Promise<Buffer | null> {
	const cache = cmp.getRecordCache(collection.name);
	if (cache && cache.has(recordOffset)) {
		return cache.get(recordOffset)!;
	}

	if (
		recordOffset < collection.headerOffset ||
		recordOffset >= collection.headerOffset + collection.header.used
	)
		return null;

	const headerBuf = await readAt(cmp.fd, recordOffset, READ_HEADER_MAX);
	if (headerBuf.length === 0) return null;

	const headerProbe = decodeRecord(headerBuf, 0);
	if (!headerProbe) return null;
	if (headerProbe.flags & RECORD_FLAG.DELETED) return null;

	const payload = await readAt(cmp.fd, recordOffset, headerProbe.totalSize);
	const rec = decodeRecord(payload, 0);
	if (!rec) return null;
	if (rec.flags & RECORD_FLAG.DELETED) return null;
	if (cache) cache.set(recordOffset, rec.data);
	return rec.data;
}

function isIdOnlySearch(config: { search?: any }) {
	if (!config.search || typeof config.search !== "object") return false;
	const keys = Object.keys(config.search);
	return keys.length > 0 && keys.every(k => k === "_id" || k === "idKey");
}
