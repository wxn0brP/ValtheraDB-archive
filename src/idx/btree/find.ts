import { AdapterError } from "@wxn0brp/db-core/errors";
import { compareSafe } from "@wxn0brp/db-core/utils/compare";
import { PageManager } from "../page";
import { InternalNode, LeafNode, NodeRef, PageType } from "./types";
import { decodeKey } from "./utils";

export async function findLeaf(
	pm: PageManager,
	value: any,
	leftmost = false,
): Promise<NodeRef> {
	let pageId = pm.getHeader().rootPage;
	let node = await pm.readRoot();

	while (node.type === PageType.Internal) {
		const internal = node as InternalNode;
		let childIdx = internal.count;

		for (let i = 0; i < internal.count; i++) {
			const keyVal = decodeKey(internal.keys[i]);
			const cmp = compareSafe(value, keyVal);
			if (cmp < 0 || (leftmost && cmp === 0)) {
				childIdx = i;
				break;
			}
		}

		pageId = internal.children[childIdx];
		node = await pm.readPage(pageId);
	}

	if (node.type !== PageType.Leaf) {
		throw new AdapterError(
			`findLeaf: expected leaf node at page ${pageId}, got type ${node.type}`,
			{
				pageId,
				type: node.type,
			},
		);
	}

	return {
		pageId,
		node,
	};
}

export async function findLeftmostLeaf(pm: PageManager, pageId: number) {
	let node = await pm.readPage(pageId);
	while (node.type === PageType.Internal) {
		const internal = node as InternalNode;
		pageId = internal.children[0];
		node = await pm.readPage(pageId);
	}
	return node as LeafNode;
}
