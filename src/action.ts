import { CustomFileCpu } from "@wxn0brp/db-core";
import { CustomActionsBase } from "@wxn0brp/db-core/base/custom";
import { readFile, writeFile, access } from "fs/promises";
import { parseGedcomToCollections } from "./gedcomParser";
import { serializeCollections } from "./gedcomSerializer";

export class DbStorageGed extends CustomActionsBase {
	private cache = new Map<string, Record<string, any>[]>();
	private cacheValid = false;

	constructor(public file: string) {
		super();
		this.fileCpu = new CustomFileCpu(
			this.read.bind(this),
			this.write.bind(this),
			true,
		);
	}

	private async loadCache() {
		if (this.cacheValid) return;

		try {
			await access(this.file);
			const content = await readFile(this.file, "utf-8");
			this.cache = parseGedcomToCollections(content);
		} catch {
			this.cache = new Map();
		}

		this.cacheValid = true;
	}

	private async saveCache() {
		const content = serializeCollections(this.cache);
		await writeFile(this.file, content, "utf-8");
	}

	async read(collection: string) {
		await this.loadCache();
		return this.cache.get(collection) ?? [];
	}

	async write(collection: string, data: Record<string, any>[]) {
		await this.loadCache();
		this.cache.set(collection, data);
		await this.saveCache();
	}

	async getCollections() {
		await this.loadCache();
		return Array.from(this.cache.keys());
	}

	async ensureCollection(collection: string) {
		await this.loadCache();
		const existed = this.cache.has(collection);
		if (!existed) {
			this.cache.set(collection, []);
			await this.saveCache();
		}
		return !existed;
	}

	async issetCollection(collection: string) {
		await this.loadCache();
		return this.cache.has(collection);
	}

	async removeCollection(collection: string) {
		await this.loadCache();
		const existed = this.cache.has(collection);
		if (existed) {
			this.cache.delete(collection);
			await this.saveCache();
		}
		return existed;
	}
}
