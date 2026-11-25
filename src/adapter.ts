import { CustomFileCpu } from "@wxn0brp/db-core";
import { CustomAdapterBase } from "@wxn0brp/db-core/base/customAdapter";
import { pathRepair } from "@wxn0brp/db-core/base/customFileCpu";
import { parse, stringify } from "csv/sync";
import { access, mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import { version } from "./version";

export interface Opts {
	file?: string;
	dir?: string;
}

export class DbStorageCsv extends CustomAdapterBase {
	version = version;

	constructor(public opts: Opts) {
		super();
		this.fileCpu = new CustomFileCpu(
			this.read.bind(this),
			this.write.bind(this),
		);
	}

	_getPath(collection: string) {
		if (this.opts.file) {
			return this.opts.file;
		} else if (this.opts.dir) {
			return this.opts.dir + "/" + pathRepair(collection) + ".csv";
		}
	}

	async read(file: string) {
		const path = this._getPath(file);
		const data = await readFile(path, "utf-8");
		const records = parse(data, {
			columns: true,
		});
		for (const record of records) {
			for (const key of Object.keys(record)) {
				const val = record[key];
				if (val === "" || val === undefined || val === null) {
					delete record[key];
					continue;
				}
				try {
					record[key] = JSON.parse(val);
				} catch {
					// keep as string if not valid JSON
				}
			}
		}
		return records;
	}

	async write(file: string, data: any) {
		const transformed = data.map((row: any) => {
			const newRow: Record<string, string> = {};
			for (const [k, v] of Object.entries(row)) {
				newRow[k] = v === undefined ? "" : JSON.stringify(v);
			}
			return newRow;
		});
		const string = stringify(transformed, {
			header: true,
		});
		const path = this._getPath(file);
		await writeFile(path, string);
	}

	async ensureCollection(collection: string) {
		const path = this._getPath(collection);
		if (this.opts.file) {
			try {
				await access(path);
				return false;
			} catch (error) {
				await writeFile(path, "");
			}
		} else if (this.opts.dir) {
			try {
				await access(path);
				return false;
			} catch (error) {
				await mkdir(path.split("/").slice(0, -1).join("/"), {
					recursive: true,
				});
				await writeFile(path, "");
			}
		}
		return true;
	}

	async issetCollection(collection: string): Promise<boolean> {
		const path = this._getPath(collection);
		try {
			await access(path);
			return true;
		} catch (error) {
			return false;
		}
	}

	async getCollections(): Promise<string[]> {
		if (this.opts.file) {
			return [
				this.opts.file,
			];
		} else if (this.opts.dir) {
			try {
				const files = await readdir(this.opts.dir, {
					recursive: true,
				});
				return files.map(f => (f.endsWith(".csv") ? f.slice(0, -4) : f));
			} catch {
				return [];
			}
		} else {
			return [];
		}
	}

	async removeCollection(collection: string): Promise<boolean> {
		await rm(this._getPath(collection), {
			force: true,
		});
		return true;
	}
}
