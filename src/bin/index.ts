import { access, constants, FileHandle, open } from "fs/promises";
import { _log } from "../log";
import { version } from "../version";
import { defaultFormat, FormatCodec } from "./format";
import { flushMeta, FileMeta, loadMeta } from "./meta";
import { allocSlot, addFreeSlot, roundUp } from "./space";
import { COLLECTION_FLAG } from "./static";
import {
	deserialize as indexDeserialize,
	newIndex as newCollectionIndex,
	serialize,
	type CollectionIndex,
} from "./idindex";
import { readAt, writeData } from "./utils";
import { decodeRecord, RECORD_FLAG } from "./record";

export interface CollectionMeta {
	name: string;
	offset: number;
	capacity: number;
}

export interface Options {
	preferredSize: number;
	growthFactor: number;
	overwriteRemovedCollection: boolean;
	defaultIndexed: boolean;
	recordCrc: boolean;
	recordCacheEnabled: boolean;
	recordCacheSize: number;
	format: FormatCodec;
}

async function safeOpen(path: string): Promise<FileHandle> {
	try {
		await access(path, constants.F_OK);
		return await open(path, "r+");
	} catch {
		_log(1, "Creating new file");
		return await open(path, "w+");
	}
}

export class BinManager {
	public fd: null | FileHandle = null;
	public meta: FileMeta;
	public options: Options;
	public recordCaches: Map<string, Map<number, Buffer>> = new Map();
	public indexCache: Map<string, CollectionIndex> = new Map();
	public dirtyIndexes: Set<string> = new Set();
	public dirtyCollections: Set<string> = new Set();
	public collectionsDirty = true;
	_inited = false;
	smartExecutor = true;
	version = "bin-storage-" + version;

	constructor(
		public path: string,
		options?: Partial<Options>,
	) {
		if (!path) throw new Error("Path not provided");

		this.options = {
			preferredSize: 512,
			growthFactor: 2,
			overwriteRemovedCollection: false,
			defaultIndexed: false,
			recordCrc: false,
			recordCacheEnabled: true,
			recordCacheSize: 1024,
			format: defaultFormat(),
			...options,
		};

		if (!this.options.preferredSize || this.options.preferredSize <= 0)
			throw new Error("Preferred size not provided correctly");
		if (this.options.growthFactor < 1.1)
			throw new Error("Growth factor must be >= 1.1");
	}

	async init() {
		if (this.fd) return;
		this.fd = await safeOpen(this.path);
		const stats = await this.fd.stat();
		this.meta = await loadMeta(this);
		if (stats.size === 0) {
			await flushMeta(this);
			this.meta.header.fileSize = (await this.fd.stat()).size;
		}
	}

	async close() {
		if (this.fd) {
			await this.flushIndexes();
			await this.fd.close();
			this.fd = null;
		}
	}

	[Symbol.asyncDispose]() {
		return this.close();
	}

	async flushIndexes() {
		if (!this.fd) return;
		for (const name of this.dirtyIndexes) {
			const collection = this.meta.collectionByName.get(name);
			const index = this.indexCache.get(name);
			if (!collection || !index) continue;
			const totalEntries = index.base.length + index.delta.length;
			if (totalEntries === 0) continue;
			const buf = await this._serializeIndex(index);
			await this._writeIndex(name, collection, buf);
		}
		this.dirtyIndexes.clear();
	}

	private async _serializeIndex(index: any): Promise<Buffer> {
		return serialize(index);
	}

	private async _writeIndex(name: string, collection: any, buf: Buffer) {
		const newLen = buf.length;
		const oldOffset = collection.header.indexOffset;
		const oldLen = collection.header.indexLen;

		const aligned =
			Math.ceil(newLen / this.meta.header.blockSize) *
			this.meta.header.blockSize;
		const slot = this.allocSpace(aligned);
		await this.writeAt(slot.offset, buf);
		if (aligned > newLen) {
			await this.writeAt(
				slot.offset + newLen,
				Buffer.alloc(aligned - newLen, 0),
			);
		}
		collection.header.indexOffset = slot.offset - collection.headerOffset;
		collection.header.indexLen = newLen;
		if (oldOffset > 0 && oldLen > 0) {
			this.freeSpace(
				collection.headerOffset + oldOffset,
				Math.max(oldLen, aligned),
			);
		}
		this.invalidateRecordCache(name);
	}

	getRecordCache(name: string): Map<number, Buffer> | null {
		if (!this.options.recordCacheEnabled) return null;
		let cache = this.recordCaches.get(name);
		if (!cache) {
			cache = new Map();
			this.recordCaches.set(name, cache);
		}
		const max = this.options.recordCacheSize;
		if (cache.size > max) {
			const drop = cache.size - max;
			const it = cache.keys();
			for (let i = 0; i < drop; i++) {
				const k = it.next().value;
				if (k === undefined) break;
				cache.delete(k);
			}
		}
		return cache;
	}

	invalidateRecordCache(name: string) {
		if (name === "*") {
			this.recordCaches.clear();
		} else {
			this.recordCaches.delete(name);
		}
	}

	async getOrLoadIndex(name: string): Promise<CollectionIndex | null> {
		const cached = this.indexCache.get(name);
		if (cached) return cached;

		const collection = this.meta.collectionByName.get(name);
		if (!collection) return null;
		if (
			collection.header.indexOffset === 0 ||
			collection.header.indexLen === 0
		) {
			const fresh = newCollectionIndex();
			this.indexCache.set(name, fresh);
			return fresh;
		}
		const idxBuf = Buffer.alloc(collection.header.indexLen);
		await this.fd!.read(
			idxBuf,
			0,
			idxBuf.length,
			collection.headerOffset + collection.header.indexOffset,
		);
		const idx = indexDeserialize(idxBuf);
		this.indexCache.set(name, idx);
		return idx;
	}

	markIndexDirty(name: string) {
		this.dirtyIndexes.add(name);
	}

	invalidateIndexCache(name: string) {
		this.indexCache.delete(name);
		this.dirtyIndexes.delete(name);
	}

	markCollectionDirty(name: string) {
		this.dirtyCollections.add(name);
	}

	allocSpace(size: number): {
		offset: number;
		size: number;
	} {
		const aligned = roundUp(size, this.meta.header.blockSize);
		if (aligned < size) throw new Error("overflow in allocation size");
		return allocSlot(this.meta.space, aligned);
	}

	freeSpace(offset: number, size: number) {
		addFreeSlot(this.meta.space, {
			offset,
			size: roundUp(size, this.meta.header.blockSize),
		});
	}

	async writeAt(offset: number, data: Buffer) {
		if (!this.fd) throw new Error("File not open");
		await this.fd.write(data, 0, data.length, offset);
	}

	async writeData(offset: number, data: Buffer, capacity: number) {
		await writeData(this.fd, offset, data, capacity);
	}

	async readRecordPayload(
		collectionName: string,
		recordOffset: number,
	): Promise<Buffer | null> {
		const collection = this.meta.collectionByName.get(collectionName);
		if (!collection) return null;
		const cache = this.getRecordCache(collectionName);
		if (cache && cache.has(recordOffset)) {
			return cache.get(recordOffset)!;
		}
		if (
			recordOffset < collection.headerOffset ||
			recordOffset >= collection.headerOffset + collection.header.used
		)
			return null;

		const headerBuf = await readAt(this.fd!, recordOffset, 6);
		if (headerBuf.length === 0) return null;
		const headerProbe = decodeRecord(headerBuf, 0);
		if (!headerProbe) return null;
		if (headerProbe.flags & RECORD_FLAG.DELETED) return null;

		const payload = await readAt(this.fd!, recordOffset, headerProbe.totalSize);
		const rec = decodeRecord(payload, 0);
		if (!rec) return null;
		if (rec.flags & RECORD_FLAG.DELETED) return null;
		if (cache) cache.set(recordOffset, rec.data);
		return rec.data;
	}

	getCollectionFlags(name: string) {
		const c = this.meta.collectionByName.get(name);
		return c ? c.header.flags : 0;
	}

	setCollectionIndexed(name: string, indexed: boolean) {
		const c = this.meta.collectionByName.get(name);
		if (!c) return;
		if (indexed) c.header.flags |= COLLECTION_FLAG.INDEXED;
		else c.header.flags &= ~COLLECTION_FLAG.INDEXED;
	}
}
