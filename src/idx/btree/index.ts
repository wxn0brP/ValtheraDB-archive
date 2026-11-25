import { compareSafe } from "@wxn0brp/db-core/utils/compare";
import { PageManager } from "../page";
import { findLeaf, findLeftmostLeaf } from "./find";
import { rebalanceLeaf } from "./rebalance";
import { binarySearchInsert, binarySearchLeft } from "./search";
import { splitLeaf } from "./split";
import {
	type InternalNode,
	type LeafNode,
	MAX_ENTRIES,
	MIN_ENTRIES,
	PageType,
} from "./types";
import { cloneKey, decodeKey } from "./utils";

export class BTree {
	constructor(public pm: PageManager) {}

	async search(value: any) {
		const header = this.pm.getHeader();
		if (header.count === 0) return [];

		const leafRef = await findLeaf(this.pm, value, true);
		let currentLeaf: LeafNode = leafRef.node as LeafNode;
		let currentPageId = leafRef.pageId;

		const results: number[] = [];
		let isFirst = true;

		while (currentLeaf) {
			let startIdx = 0;
			if (isFirst) {
				startIdx = binarySearchLeft(currentLeaf, value);
				isFirst = false;
			}

			for (let i = startIdx; i < currentLeaf.count; i++) {
				const keyVal = decodeKey(currentLeaf.keys[i]);
				const cmp = compareSafe(keyVal, value);
				if (cmp === 0) {
					const fileNum = currentLeaf.fileNums[i];
					if (!results.includes(fileNum)) results.push(fileNum);
				} else if (cmp > 0) {
					return results;
				}
			}

			if (currentLeaf.nextPage === 0) break;
			currentPageId = currentLeaf.nextPage;
			const nextNode = await this.pm.readPage(currentPageId);
			currentLeaf = nextNode.type === PageType.Leaf ? nextNode : null;
		}

		return results;
	}

	async insert(value: any, file: number) {
		const header = this.pm.getHeader();

		if (header.count === 0) {
			const root = await this.pm.readRoot<LeafNode>();
			root.keys.push(this.encodeKey(value));
			root.fileNums.push(file);
			root.count = 1;
			await this.pm.writePage(header.rootPage, root);
			this.pm.setRootCache(root);
			header.count = 1;
			await this.pm.writeHeader();
			return;
		}

		const leafRef = await findLeaf(this.pm, value);
		const leaf = leafRef.node as LeafNode;
		const leafPageId = leafRef.pageId;

		const insertPos = binarySearchInsert(leaf, value, file);
		leaf.keys.splice(insertPos, 0, this.encodeKey(value));
		leaf.fileNums.splice(insertPos, 0, file);
		leaf.count++;

		await this.pm.writePage(leafPageId, leaf);
		header.count++;
		await this.pm.writeHeader();

		if (leaf.count > MAX_ENTRIES) {
			await splitLeaf(this.pm, leaf, leafPageId);
		}
	}

	async remove(value: any, file: number) {
		const header = this.pm.getHeader();
		if (header.count === 0) return false;

		let leafRef = await findLeaf(this.pm, value, true);

		while (true) {
			const leaf = leafRef.node as LeafNode;

			let found = -1;
			for (let i = 0; i < leaf.count; i++) {
				const keyVal = decodeKey(leaf.keys[i]);
				if (compareSafe(keyVal, value) === 0 && leaf.fileNums[i] === file) {
					found = i;
					break;
				}
			}

			if (found !== -1) {
				const leafPageId = leafRef.pageId;
				leaf.keys.splice(found, 1);
				leaf.fileNums.splice(found, 1);
				leaf.count--;

				const isRoot = header.rootPage === leafPageId;
				if (!isRoot && leaf.count < MIN_ENTRIES) {
					await this.pm.writePage(leafPageId, leaf);
					await rebalanceLeaf(this.pm, leaf, leafPageId);
				} else {
					await this.pm.writePage(leafPageId, leaf);
				}

				header.count--;
				await this.pm.writeHeader();

				return true;
			}

			if (leaf.nextPage === 0) return false;

			const next = await this.pm.readPage<LeafNode>(leaf.nextPage);
			if (next.type !== PageType.Leaf || next.count === 0) return false;
			if (compareSafe(decodeKey(next.keys[0]), value) > 0) return false;

			leafRef = {
				pageId: leaf.nextPage,
				node: next,
			};
		}
	}

	async bulkLoad(
		entries: {
			value: any;
			file: number;
		}[],
	) {
		const header = this.pm.getHeader();

		const oldRootPage = header.rootPage;

		entries.sort((a, b) => {
			const cmp = compareSafe(a.value, b.value);
			if (cmp !== 0) return cmp;
			return a.file - b.file;
		});

		if (entries.length === 0) {
			const emptyRoot: LeafNode = {
				type: PageType.Leaf,
				count: 0,
				parent: 0,
				nextPage: 0,
				fileNums: [],
				keys: [],
			};
			await this.pm.writePage(header.rootPage, emptyRoot);
			this.pm.setRootCache(emptyRoot);
			header.count = 0;
			await this.pm.writeHeader();
			return;
		}

		const leaves: number[] = [];
		for (let i = 0; i < entries.length; i += MAX_ENTRIES) {
			const chunk = entries.slice(i, i + MAX_ENTRIES);
			const pageId = await this.pm.allocatePage();
			const leaf: LeafNode = {
				type: PageType.Leaf,
				count: chunk.length,
				parent: 0,
				nextPage: 0,
				fileNums: chunk.map(e => e.file),
				keys: chunk.map(e => this.encodeKey(e.value)),
			};
			await this.pm.writePage(pageId, leaf);
			leaves.push(pageId);
		}

		for (let i = 0; i < leaves.length - 1; i++) {
			const leaf = await this.pm.readPage<LeafNode>(leaves[i]);
			leaf.nextPage = leaves[i + 1];
			await this.pm.writePage(leaves[i], leaf);
		}

		if (leaves.length === 1) {
			header.rootPage = leaves[0];
			const leaf = await this.pm.readPage<LeafNode>(leaves[0]);
			leaf.parent = 0;
			await this.pm.writePage(leaves[0], leaf);
			this.pm.setRootCache(leaf);
			header.count = entries.length;
			await this.pm.freePage(oldRootPage);
			await this.pm.writeHeader();
			return;
		}

		let currentLevel = leaves;

		while (currentLevel.length > 1) {
			const nextLevel: number[] = [];

			for (let i = 0; i < currentLevel.length; i += MAX_ENTRIES + 1) {
				const end = Math.min(i + MAX_ENTRIES + 1, currentLevel.length);
				const children = currentLevel.slice(i, end);

				if (children.length === 1) {
					nextLevel.push(children[0]);
					continue;
				}

				const pageId = await this.pm.allocatePage();
				const keys: {
					type: number;
					data: Buffer;
				}[] = [];

				for (let j = 1; j < children.length; j++) {
					const leftmostLeaf = await findLeftmostLeaf(this.pm, children[j]);
					keys.push(cloneKey(leftmostLeaf.keys[0]));
				}

				const internal: InternalNode = {
					type: PageType.Internal,
					count: keys.length,
					parent: 0,
					children,
					keys,
				};
				await this.pm.writePage(pageId, internal);

				for (const childId of children) {
					const child = await this.pm.readPage(childId);
					if (
						child.type === PageType.Internal ||
						child.type === PageType.Leaf
					) {
						child.parent = pageId;
						await this.pm.writePage(childId, child);
					}
				}

				nextLevel.push(pageId);
			}

			currentLevel = nextLevel;
		}

		header.rootPage = currentLevel[0];
		header.count = entries.length;
		this.pm.setRootCache(await this.pm.readPage(currentLevel[0]));
		await this.pm.freePage(oldRootPage);
		await this.pm.writeHeader();
	}

	async close() {
		await this.pm.close();
	}

	encodeKey(value: any): {
		type: number;
		data: Buffer;
	} {
		if (typeof value === "number") {
			const buf = Buffer.alloc(8);
			buf.writeDoubleLE(value, 0);
			return {
				type: 1,
				data: buf,
			};
		}
		if (typeof value === "boolean") {
			return {
				type: 2,
				data: Buffer.from([
					value ? 1 : 0,
				]),
			};
		}
		if (value instanceof Date) {
			const buf = Buffer.alloc(8);
			buf.writeDoubleLE(value.getTime(), 0);
			return {
				type: 3,
				data: buf,
			};
		}
		if (value === null) {
			return {
				type: 4,
				data: Buffer.alloc(0),
			};
		}
		const str = String(value);
		return {
			type: 0,
			data: Buffer.from(str, "utf-8"),
		};
	}
}
