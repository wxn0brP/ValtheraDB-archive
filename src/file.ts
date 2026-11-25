import { FileAdapter, vFileCpu } from "@wxn0brp/db-storage-dir";
import type { DbDirOpts } from "@wxn0brp/db-storage-dir/types";
import { version } from "./version";

export class GitSnapshotAdapter extends FileAdapter {
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
