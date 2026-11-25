import type { VQueryT } from "@wxn0brp/db-core/types/query";
import { FileAdapter } from "@wxn0brp/db-storage-dir";
import { access, unlink } from "fs/promises";
import { join } from "path";
import { BTree } from "./btree";
import { create } from "./page/utils";
import { compareSafe } from "@wxn0brp/db-core/utils/compare";

export async function createIndex(
	action: FileAdapter,
	collection: string,
	keys: string[],
) {
	const collectionPath = join(action.folder, collection);
	try {
		await access(collectionPath);
	} catch {
		return;
	}

	const files = await action.utils.getSortedFiles(collectionPath, {});

	for (const key of keys) {
		const indexEntries: {
			value: any;
			file: number;
		}[] = [];

		for (const file of files) {
			const fileNumber = parseInt(file.replace(".db", ""), 10);
			const query: VQueryT.Find = {
				collection,
				search: {},
				control: {},
				dbFindOpts: {},
				findOpts: {},
			};
			action._ensureQueryFormat(query);
			const data = await action.fileCpu.find(
				join(action.folder, collection, file),
				query,
				action.fileCpuOpts,
			);

			if (!data) continue;

			for (const doc of data) {
				if (doc[key] !== undefined) {
					indexEntries.push({
						value: doc[key],
						file: fileNumber,
					});
				}
			}
		}

		indexEntries.sort((a, b) => {
			const cmp = compareSafe(a.value, b.value);
			if (cmp !== 0) return cmp;
			return a.file - b.file;
		});

		const indexPath = join(action.folder, collection, `${key}.idx`);
		try {
			await unlink(indexPath);
		} catch {}

		const pm = await create(indexPath);
		const tree = new BTree(pm);
		await tree.bulkLoad(indexEntries);
		await tree.close();
	}
}
