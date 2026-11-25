import { PageManager } from "../page";
import { InternalNode, LeafNode, MIN_ENTRIES, PageType } from "./types";
import { cloneKey } from "./utils";

export async function rebalanceLeaf(
	pm: PageManager,
	leaf: LeafNode,
	leafPageId: number,
) {
	const header = pm.getHeader();
	const parent =
		leaf.parent === header.rootPage
			? await pm.readRoot<InternalNode>()
			: await pm.readPage<InternalNode>(leaf.parent);

	const childIdx = findChildIdx(parent, leafPageId);

	if (childIdx > 0) {
		const leftSib = await pm.readPage<LeafNode>(parent.children[childIdx - 1]);
		if (leftSib.count > MIN_ENTRIES) {
			const lastKey = leftSib.keys.pop()!;
			const lastFile = leftSib.fileNums.pop()!;
			leftSib.count--;

			leaf.keys.unshift(lastKey);
			leaf.fileNums.unshift(lastFile);
			leaf.count++;

			parent.keys[childIdx - 1] = cloneKey(leaf.keys[0]);

			await pm.writePage(parent.children[childIdx - 1], leftSib);
			await pm.writePage(leafPageId, leaf);
			await pm.writePage(leaf.parent, parent);
			return;
		}
	}

	if (childIdx < parent.count) {
		const rightSib = await pm.readPage<LeafNode>(parent.children[childIdx + 1]);
		if (rightSib.count > MIN_ENTRIES) {
			const firstKey = rightSib.keys.shift()!;
			const firstFile = rightSib.fileNums.shift()!;
			rightSib.count--;

			leaf.keys.push(firstKey);
			leaf.fileNums.push(firstFile);
			leaf.count++;

			parent.keys[childIdx] = cloneKey(rightSib.keys[0]);

			await pm.writePage(parent.children[childIdx + 1], rightSib);
			await pm.writePage(leafPageId, leaf);
			await pm.writePage(leaf.parent, parent);
			return;
		}
	}

	if (childIdx > 0) {
		const leftSib = await pm.readPage<LeafNode>(parent.children[childIdx - 1]);
		const leftPageId = parent.children[childIdx - 1];

		leftSib.keys.push(...leaf.keys);
		leftSib.fileNums.push(...leaf.fileNums);
		leftSib.count += leaf.count;
		leftSib.nextPage = leaf.nextPage;

		parent.keys.splice(childIdx - 1, 1);
		parent.children.splice(childIdx, 1);
		parent.count--;

		await pm.writePage(leftPageId, leftSib);
		await pm.freePage(leafPageId);
		await pm.writePage(leaf.parent, parent);

		await handleParentAfterMerge(pm, parent, leaf.parent, header);
		return;
	}

	if (childIdx < parent.count) {
		const rightSib = await pm.readPage<LeafNode>(parent.children[childIdx + 1]);
		const rightPageId = parent.children[childIdx + 1];

		leaf.keys.push(...rightSib.keys);
		leaf.fileNums.push(...rightSib.fileNums);
		leaf.count += rightSib.count;
		leaf.nextPage = rightSib.nextPage;

		parent.keys.splice(childIdx, 1);
		parent.children.splice(childIdx + 1, 1);
		parent.count--;

		await pm.writePage(leafPageId, leaf);
		await pm.freePage(rightPageId);
		await pm.writePage(leaf.parent, parent);

		await handleParentAfterMerge(pm, parent, leaf.parent, header);
	}
}

async function rebalanceInternal(
	pm: PageManager,
	node: InternalNode,
	pageId: number,
) {
	const header = pm.getHeader();
	if (node.parent === 0) return;

	const parent =
		node.parent === header.rootPage
			? await pm.readRoot<InternalNode>()
			: await pm.readPage<InternalNode>(node.parent);
	const childIdx = findChildIdx(parent, pageId);

	if (childIdx > 0) {
		const leftSib = await pm.readPage<InternalNode>(
			parent.children[childIdx - 1],
		);
		if (leftSib.count > MIN_ENTRIES) {
			node.keys.unshift(cloneKey(parent.keys[childIdx - 1]));
			node.children.unshift(leftSib.children[leftSib.count]);
			node.count++;

			parent.keys[childIdx - 1] = cloneKey(leftSib.keys[leftSib.count - 1]);

			leftSib.keys.pop();
			leftSib.children.pop();
			leftSib.count--;

			const movedChild = await pm.readPage(node.children[0]);
			if (
				movedChild.type === PageType.Internal ||
				movedChild.type === PageType.Leaf
			) {
				movedChild.parent = pageId;
				await pm.writePage(node.children[0], movedChild);
			}

			await pm.writePage(parent.children[childIdx - 1], leftSib);
			await pm.writePage(pageId, node);
			await pm.writePage(node.parent, parent);
			return;
		}
	}

	if (childIdx < parent.count) {
		const rightSib = await pm.readPage<InternalNode>(
			parent.children[childIdx + 1],
		);
		if (rightSib.count > MIN_ENTRIES) {
			node.keys.push(cloneKey(parent.keys[childIdx]));
			node.children.push(rightSib.children[0]);
			node.count++;

			parent.keys[childIdx] = cloneKey(rightSib.keys[0]);

			rightSib.keys.shift();
			rightSib.children.shift();
			rightSib.count--;

			const movedChild = await pm.readPage(node.children[node.count]);
			if (
				movedChild.type === PageType.Internal ||
				movedChild.type === PageType.Leaf
			) {
				movedChild.parent = pageId;
				await pm.writePage(node.children[node.count], movedChild);
			}

			await pm.writePage(parent.children[childIdx + 1], rightSib);
			await pm.writePage(pageId, node);
			await pm.writePage(node.parent, parent);
			return;
		}
	}

	if (childIdx > 0) {
		const leftSib = await pm.readPage<InternalNode>(
			parent.children[childIdx - 1],
		);
		const leftPageId = parent.children[childIdx - 1];

		leftSib.keys.push(cloneKey(parent.keys[childIdx - 1]));
		leftSib.keys.push(...node.keys.map(k => cloneKey(k)));
		leftSib.children.push(...node.children);
		leftSib.count += 1 + node.count;

		for (const childId of node.children) {
			const child = await pm.readPage(childId);
			if (child.type === PageType.Internal || child.type === PageType.Leaf) {
				child.parent = leftPageId;
				await pm.writePage(childId, child);
			}
		}

		parent.keys.splice(childIdx - 1, 1);
		parent.children.splice(childIdx, 1);
		parent.count--;

		await pm.writePage(leftPageId, leftSib);
		await pm.freePage(pageId);
		await pm.writePage(node.parent, parent);

		await handleParentAfterMerge(pm, parent, node.parent, header);
		return;
	}

	if (childIdx < parent.count) {
		const rightSib = await pm.readPage<InternalNode>(
			parent.children[childIdx + 1],
		);
		const rightPageId = parent.children[childIdx + 1];

		node.keys.push(cloneKey(parent.keys[childIdx]));
		node.keys.push(...rightSib.keys.map(k => cloneKey(k)));
		node.children.push(...rightSib.children);
		node.count += 1 + rightSib.count;

		for (const childId of rightSib.children) {
			const child = await pm.readPage(childId);
			if (child.type === PageType.Internal || child.type === PageType.Leaf) {
				child.parent = pageId;
				await pm.writePage(childId, child);
			}
		}

		parent.keys.splice(childIdx, 1);
		parent.children.splice(childIdx + 1, 1);
		parent.count--;

		await pm.writePage(pageId, node);
		await pm.freePage(rightPageId);
		await pm.writePage(node.parent, parent);

		await handleParentAfterMerge(pm, parent, node.parent, header);
	}
}

function findChildIdx(parent: InternalNode, childPageId: number) {
	for (let i = 0; i <= parent.count; i++) {
		if (parent.children[i] === childPageId) return i;
	}
	return -1;
}

async function handleParentAfterMerge(
	pm: PageManager,
	parent: InternalNode,
	parentPageId: number,
	header: {
		rootPage: number;
	},
) {
	if (parent.children.length === 1 && parentPageId === header.rootPage) {
		header.rootPage = parent.children[0];
		const newRoot = await pm.readPage(header.rootPage);
		if (newRoot.type === PageType.Internal || newRoot.type === PageType.Leaf) {
			newRoot.parent = 0;
			await pm.writePage(header.rootPage, newRoot);
		}
		pm.setRootCache(newRoot);
		await pm.freePage(parentPageId);
		await pm.writeHeader();
		return;
	}

	await pm.writeHeader();

	if (parent.count < MIN_ENTRIES && parentPageId !== header.rootPage) {
		await rebalanceInternal(pm, parent, parentPageId);
	}
}
