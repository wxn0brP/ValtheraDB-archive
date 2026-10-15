import { FileActions, vFileCpu } from "@wxn0brp/db-storage-dir";
import type { DbDirOpts } from "@wxn0brp/db-storage-dir/types";
import { version } from "./version";

export class GitSnapshotActions extends FileActions {
	version = version;
	capabilities = {
		transactions: true,
		indexes: false,
		persistent: true,
	};

	constructor(folder: string, options: DbDirOpts) {
		super(folder, options, vFileCpu);
	}

	async getCollections() {
		const all = await super.getCollections();
		return all.filter(c => !c.startsWith(".git"));
	}
}
