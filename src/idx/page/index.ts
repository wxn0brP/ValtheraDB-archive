import { AdapterError } from "@wxn0brp/db-core/errors";
import { type FileHandle } from "fs/promises";
import {
	PAGE_SIZE,
	PageType,
	type BTreeNode,
	type FreeNode,
	type IndexHeader,
} from "../btree/types";
import { deserializeNode, serializeHeader, serializeNode } from "./utils";

export class PageManager {
	rootCache: BTreeNode = null;

	constructor(
		public fd: FileHandle,
		private header: IndexHeader,
	) {}

	getHeader() {
		return this.header;
	}

	async readPage<T extends BTreeNode>(pageId: number) {
		if (pageId === 0)
			throw new AdapterError("Cannot read header as node", {
				pageId,
			});
		const buf = Buffer.alloc(PAGE_SIZE);
		await this.fd.read(buf, 0, PAGE_SIZE, pageId * PAGE_SIZE);
		return deserializeNode(buf) as T;
	}

	async writePage(pageId: number, node: BTreeNode) {
		const buf = Buffer.alloc(PAGE_SIZE);
		serializeNode(node, buf);
		await this.fd.write(buf, 0, PAGE_SIZE, pageId * PAGE_SIZE);
	}

	async readRoot<T extends BTreeNode>() {
		if (this.rootCache) return this.rootCache as T;
		this.rootCache = await this.readPage(this.header.rootPage);
		return this.rootCache as T;
	}

	setRootCache(node: BTreeNode) {
		this.rootCache = node;
	}

	async allocatePage() {
		let pageId: number;
		if (this.header.freeList !== 0) {
			pageId = this.header.freeList;
			const buf = Buffer.alloc(PAGE_SIZE);
			await this.fd.read(buf, 0, PAGE_SIZE, pageId * PAGE_SIZE);
			const freeNode = deserializeNode(buf) as FreeNode;
			this.header.freeList = freeNode.nextFree;
		} else {
			pageId = this.header.nextPage;
			this.header.nextPage++;
		}
		await this.writeHeader();
		return pageId;
	}

	async freePage(pageId: number) {
		const freeNode: FreeNode = {
			type: PageType.Free,
			nextFree: this.header.freeList,
		};
		await this.writePage(pageId, freeNode);
		this.header.freeList = pageId;
		await this.writeHeader();
	}

	async writeHeader() {
		const buf = Buffer.alloc(PAGE_SIZE);
		serializeHeader(this.header, buf);
		await this.fd.write(buf, 0, PAGE_SIZE, 0);
	}

	async close() {
		await this.fd.close();
	}
}
