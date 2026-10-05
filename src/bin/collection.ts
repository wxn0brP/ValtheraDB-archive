import { COLLECTION_FLAG, COLLECTION_HEADER_SIZE } from "./static";
import { flushMeta, newCollectionHeader } from "./meta";
import { roundUp } from "./space";
import { BinManager } from "./index";
import { encodeCollectionHeader } from "./collection-header";

export async function ensureCollection(
	cmp: BinManager,
	name: string,
	minSize: number = COLLECTION_HEADER_SIZE,
) {
	if (!cmp.fd) throw new Error("File not open");
	if (cmp.meta.collectionByName.has(name)) return;

	const capacity = roundUp(
		Math.max(minSize, COLLECTION_HEADER_SIZE + cmp.options.preferredSize),
		cmp.meta.header.blockSize,
	);
	const slot = cmp.allocSpace(capacity);
	const header = newCollectionHeader(
		capacity,
		cmp.options.defaultIndexed ? COLLECTION_FLAG.INDEXED : 0,
	);

	const record = {
		name,
		headerOffset: slot.offset,
		header,
	};
	cmp.meta.collections.push(record);
	cmp.meta.collectionByName.set(name, record);
	cmp.collectionsDirty = true;

	const headerBuf = encodeCollectionHeader(header);
	await cmp.writeAt(slot.offset, headerBuf);

	await flushMeta(cmp);
}

export async function removeCollection(cmp: BinManager, name: string) {
	if (!cmp.fd) throw new Error("File not open");

	const collection = cmp.meta.collectionByName.get(name);
	if (!collection) throw new Error(`collection ${name} not found`);

	if (cmp.options.overwriteRemovedCollection) {
		const zeros = Buffer.alloc(collection.header.capacity, 0);
		await cmp.writeAt(collection.headerOffset, zeros);
	}

	cmp.meta.collections = cmp.meta.collections.filter(c => c.name !== name);
	cmp.meta.collectionByName.delete(name);
	cmp.invalidateRecordCache(name);
	cmp.invalidateIndexCache(name);
	cmp.collectionsDirty = true;

	cmp.freeSpace(collection.headerOffset, collection.header.capacity);

	if (collection.header.indexOffset > 0 && collection.header.indexLen > 0) {
		const aligned =
			Math.ceil(collection.header.indexLen / cmp.meta.header.blockSize) *
			cmp.meta.header.blockSize;
		cmp.freeSpace(
			collection.headerOffset + collection.header.indexOffset,
			aligned,
		);
	}

	await flushMeta(cmp);
}
