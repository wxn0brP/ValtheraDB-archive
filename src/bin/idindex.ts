import { compareIds } from "@wxn0brp/db-core/utils/id";
import { INDEX_ENTRY_SIZE } from "./static";

export interface IndexEntry {
	id: string;
	offset: number;
}

export interface CollectionIndex {
	base: IndexEntry[];
	delta: IndexEntry[];
}

export const DELTA_MERGE_THRESHOLD = 64;

export function newIndex(): CollectionIndex {
	return {
		base: [],
		delta: [],
	};
}

export function lookup(index: CollectionIndex, id: string): number | null {
	const dIdx = findSorted(index.delta, id);
	if (dIdx !== -1) return index.delta[dIdx].offset;
	const bIdx = findSorted(index.base, id);
	if (bIdx !== -1) return index.base[bIdx].offset;
	return null;
}

export function insert(index: CollectionIndex, id: string, offset: number) {
	if (findSorted(index.delta, id) !== -1) return false;
	if (findSorted(index.base, id) !== -1) return false;
	return insertSorted(index.delta, {
		id,
		offset,
	});
}

export function remove(index: CollectionIndex, id: string) {
	const dIdx = findSorted(index.delta, id);
	if (dIdx !== -1) {
		index.delta.splice(dIdx, 1);
		return true;
	}
	const bIdx = findSorted(index.base, id);
	if (bIdx !== -1) {
		index.base.splice(bIdx, 1);
		return true;
	}
	return false;
}

export function update(index: CollectionIndex, id: string, newOffset: number) {
	const dIdx = findSorted(index.delta, id);
	if (dIdx !== -1) {
		index.delta[dIdx].offset = newOffset;
		return true;
	}
	const bIdx = findSorted(index.base, id);
	if (bIdx !== -1) {
		index.base[bIdx].offset = newOffset;
		return true;
	}
	return false;
}

export function size(index: CollectionIndex) {
	return (index.base.length + index.delta.length) * INDEX_ENTRY_SIZE;
}

export function serialize(index: CollectionIndex): Buffer {
	const total = index.base.length + index.delta.length;
	const buf = Buffer.alloc(total * INDEX_ENTRY_SIZE);
	writeEntries(buf, 0, index.base);
	writeEntries(buf, index.base.length * INDEX_ENTRY_SIZE, index.delta);
	return buf;
}

export function deserialize(buf: Buffer): CollectionIndex {
	const idx: CollectionIndex = {
		base: [],
		delta: [],
	};
	const count = Math.floor(buf.length / INDEX_ENTRY_SIZE);
	for (let i = 0; i < count; i++) {
		idx.base.push(readEntry(buf, i));
	}
	return idx;
}

export function needsMerge(index: CollectionIndex) {
	return index.delta.length >= DELTA_MERGE_THRESHOLD;
}

export function mergeDelta(index: CollectionIndex) {
	if (index.delta.length === 0) return;
	const merged: IndexEntry[] = [];
	let i = 0;
	let j = 0;
	while (i < index.base.length && j < index.delta.length) {
		const cmp = compareIds(index.base[i].id, index.delta[j].id);
		if (cmp < 0) {
			merged.push(index.base[i++]);
		} else if (cmp > 0) {
			merged.push(index.delta[j++]);
		} else {
			merged.push(index.delta[j++]);
			i++;
		}
	}
	while (i < index.base.length) merged.push(index.base[i++]);
	while (j < index.delta.length) merged.push(index.delta[j++]);
	index.base = merged;
	index.delta = [];
}

function writeEntries(buf: Buffer, baseOffset: number, entries: IndexEntry[]) {
	for (let i = 0; i < entries.length; i++) {
		const e = entries[i];
		const off = baseOffset + i * INDEX_ENTRY_SIZE;
		const idBuf = Buffer.from(e.id, "utf8");
		const idLen = Math.min(idBuf.length, 56);
		idBuf.copy(buf, off, 0, idLen);
		buf.writeUInt8(idLen, off + 56);
		buf.writeUInt8(0, off + 57);
		buf.writeUInt8(0, off + 58);
		buf.writeUInt8(0, off + 59);
		buf.writeUInt32LE(e.offset, off + 60);
	}
}

function readEntry(buf: Buffer, i: number): IndexEntry {
	const off = i * INDEX_ENTRY_SIZE;
	const idLen = buf.readUInt8(off + 56);
	const id = buf.subarray(off, off + idLen).toString("utf8");
	const offset = buf.readUInt32LE(off + 60);
	return {
		id,
		offset,
	};
}

function findSorted(list: IndexEntry[], id: string) {
	let lo = 0;
	let hi = list.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		const cmp = compareIds(list[mid].id, id);
		if (cmp === 0) return mid;
		if (cmp < 0) lo = mid + 1;
		else hi = mid;
	}
	return -1;
}

function insertSorted(list: IndexEntry[], entry: IndexEntry) {
	let lo = 0;
	let hi = list.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		const cmp = compareIds(list[mid].id, entry.id);
		if (cmp === 0) return false;
		if (cmp < 0) lo = mid + 1;
		else hi = mid;
	}
	list.splice(lo, 0, entry);
	return true;
}
