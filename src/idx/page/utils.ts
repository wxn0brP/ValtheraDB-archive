import { AdapterError } from "@wxn0brp/db-core/errors";
import { open, type FileHandle } from "fs/promises";
import { PageManager } from ".";
import {
	BTreeNode,
	IndexHeader,
	InternalNode,
	LeafNode,
	MAGIC,
	PAGE_SIZE,
	PageType,
	VERSION,
} from "../btree/types";

export function deserializeNode(buf: Buffer): BTreeNode {
	const type = buf.readUInt8(0) as PageType;

	if (type === PageType.Free) {
		return {
			type: PageType.Free,
			nextFree: buf.readUInt32LE(1),
		};
	}

	const count = buf.readUInt16LE(1);
	const parent = buf.readUInt32LE(3);

	if (type === PageType.Internal) {
		let offset = 7;
		const children: number[] = [];
		for (let i = 0; i <= count; i++) {
			children.push(buf.readUInt32LE(offset));
			offset += 4;
		}
		const keys: {
			type: number;
			data: Buffer;
		}[] = [];
		for (let i = 0; i < count; i++) {
			const keyType = buf.readUInt8(offset);
			offset++;
			const keyLen = buf.readUInt16LE(offset);
			offset += 2;
			const keyData = Buffer.alloc(keyLen);
			buf.copy(keyData, 0, offset, offset + keyLen);
			offset += keyLen;
			keys.push({
				type: keyType,
				data: keyData,
			});
		}
		const node: InternalNode = {
			type: PageType.Internal,
			count,
			parent,
			children,
			keys,
		};
		return node;
	}

	if (type === PageType.Leaf) {
		const nextPage = buf.readUInt32LE(7);
		let offset = 11;
		const fileNums: number[] = [];
		for (let i = 0; i < count; i++) {
			fileNums.push(buf.readUInt32LE(offset));
			offset += 4;
		}
		const keys: {
			type: number;
			data: Buffer;
		}[] = [];
		for (let i = 0; i < count; i++) {
			const keyType = buf.readUInt8(offset);
			offset++;
			const keyLen = buf.readUInt16LE(offset);
			offset += 2;
			const keyData = Buffer.alloc(keyLen);
			buf.copy(keyData, 0, offset, offset + keyLen);
			offset += keyLen;
			keys.push({
				type: keyType,
				data: keyData,
			});
		}
		const node: LeafNode = {
			type: PageType.Leaf,
			count,
			parent,
			nextPage,
			fileNums,
			keys,
		};
		return node;
	}

	throw new AdapterError(`Unknown page type: ${type}`, {
		type,
	});
}

export function serializeHeader(header: IndexHeader, buf: Buffer) {
	buf.write(MAGIC, 0, 4, "ascii");
	buf.writeUInt8(VERSION, 4);
	buf.writeUInt32LE(header.rootPage, 5);
	buf.writeUInt32LE(header.nextPage, 9);
	buf.writeUInt32LE(header.count, 13);
	buf.writeUInt32LE(header.freeList, 17);
}

export function deserializeHeader(buf: Buffer): IndexHeader {
	const magic = buf.toString("ascii", 0, 4);
	if (magic !== MAGIC)
		throw new AdapterError(`Invalid index file: ${magic}`, {
			magic,
			expected: MAGIC,
		});
	return {
		rootPage: buf.readUInt32LE(5),
		nextPage: buf.readUInt32LE(9),
		count: buf.readUInt32LE(13),
		freeList: buf.readUInt32LE(17),
	};
}

export function serializeNode(node: BTreeNode, buf: Buffer) {
	buf.fill(0);

	if (node.type === PageType.Free) {
		buf.writeUInt8(PageType.Free, 0);
		buf.writeUInt32LE(node.nextFree, 1);
		return;
	}

	buf.writeUInt8(node.type, 0);
	buf.writeUInt16LE(node.count, 1);
	buf.writeUInt32LE(node.parent, 3);

	if (node.type === PageType.Internal) {
		let offset = 7;
		for (let i = 0; i <= node.count; i++) {
			buf.writeUInt32LE(node.children[i], offset);
			offset += 4;
		}
		for (let i = 0; i < node.count; i++) {
			const key = node.keys[i];
			buf.writeUInt8(key.type, offset);
			offset++;
			buf.writeUInt16LE(key.data.length, offset);
			offset += 2;
			key.data.copy(buf, offset);
			offset += key.data.length;
		}
	} else if (node.type === PageType.Leaf) {
		buf.writeUInt32LE(node.nextPage, 7);
		let offset = 11;
		for (let i = 0; i < node.count; i++) {
			buf.writeUInt32LE(node.fileNums[i], offset);
			offset += 4;
		}
		for (let i = 0; i < node.count; i++) {
			const key = node.keys[i];
			buf.writeUInt8(key.type, offset);
			offset++;
			buf.writeUInt16LE(key.data.length, offset);
			offset += 2;
			key.data.copy(buf, offset);
			offset += key.data.length;
		}
	}
}

export async function create(filePath: string) {
	let fd: FileHandle;
	let isNew = false;

	try {
		fd = await open(filePath, "r+");
	} catch {
		fd = await open(filePath, "w+");
		isNew = true;
	}

	const stat = await fd.stat();
	let header: IndexHeader;

	if (stat.size === 0 || isNew) {
		header = {
			rootPage: 1,
			nextPage: 2,
			count: 0,
			freeList: 0,
		};
		const buf = Buffer.alloc(PAGE_SIZE);
		serializeHeader(header, buf);
		await fd.write(buf, 0, PAGE_SIZE, 0);

		const rootLeaf: LeafNode = {
			type: PageType.Leaf,
			count: 0,
			parent: 0,
			nextPage: 0,
			fileNums: [],
			keys: [],
		};
		const rootBuf = Buffer.alloc(PAGE_SIZE);
		serializeNode(rootLeaf, rootBuf);
		await fd.write(rootBuf, 0, PAGE_SIZE, PAGE_SIZE);
	} else {
		const headerBuf = Buffer.alloc(PAGE_SIZE);
		await fd.read(headerBuf, 0, PAGE_SIZE, 0);
		header = deserializeHeader(headerBuf);
	}

	return new PageManager(fd, header);
}
