import { CustomFileCpu } from "@wxn0brp/db-core";
import { CustomActionsBase } from "@wxn0brp/db-core/base/custom";
import { DbOpts } from "@wxn0brp/db-core/types/options";
import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	randomBytes,
	ScryptOptions,
	scryptSync,
} from "crypto";
import { promises as fs } from "fs";
import { mkdir } from "fs/promises";
import { dirname, join } from "path";
import { exists } from "./utils";

export interface EncryptedActionOptionsInternal {
	encryptionKey: string;
	salt: string;
	keylen?: number;
	options?: ScryptOptions;
}

export type EncryptedActionOptions = EncryptedActionOptionsInternal &
	Omit<DbOpts, "dbAction">;

export class EncryptedAction extends CustomActionsBase {
	key: Buffer;
	_inited = false;

	constructor(
		public folder: string,
		public options: EncryptedActionOptions,
	) {
		super();
		this.fileCpu = new CustomFileCpu(
			this._read.bind(this),
			this._write.bind(this),
		);

		this.key = scryptSync(
			options.encryptionKey,
			options.salt,
			options.keylen ?? 32,
			options.options ?? {},
		);
	}

	async init() {
		if (!(await exists(this.folder)))
			await mkdir(this.folder, {
				recursive: true,
			});
	}

	_encrypt(data: Buffer, collection: string): Buffer {
		const collectionKey = createHmac("sha256", this.key)
			.update(collection)
			.digest();

		const iv = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", collectionKey, iv);
		cipher.setAAD(Buffer.from(collection));

		const encrypted = Buffer.concat([
			cipher.update(data),
			cipher.final(),
		]);

		const authTag = cipher.getAuthTag();

		return Buffer.concat([
			iv,
			authTag,
			encrypted,
		]);
	}

	_decrypt(payload: Buffer, collection: string): Buffer {
		if (payload.length < 28) return Buffer.from("[]", "utf8");

		const collectionKey = createHmac("sha256", this.key)
			.update(collection)
			.digest();

		const iv = payload.subarray(0, 12);
		const authTag = payload.subarray(12, 28);
		const encrypted = payload.subarray(28);

		const decipher = createDecipheriv("aes-256-gcm", collectionKey, iv);
		decipher.setAuthTag(authTag);
		decipher.setAAD(Buffer.from(collection));

		return Buffer.concat([
			decipher.update(encrypted),
			decipher.final(),
		]);
	}

	async _read(collection: string): Promise<any[]> {
		const filePath = join(this.folder, collection + ".edb");
		try {
			const encContent = await fs.readFile(filePath);
			const json = this._decrypt(encContent, collection).toString("utf8");
			return JSON.parse(json);
		} catch (err) {
			if ((err as any).code === "ENOENT") return [];
			throw err;
		}
	}

	async _write(collection: string, data: any[]): Promise<void> {
		const json = JSON.stringify(data);
		const encContent = this._encrypt(Buffer.from(json, "utf8"), collection);
		const filePath = join(this.folder, collection + ".edb");
		await fs.writeFile(filePath, encContent);
	}

	async getCollections() {
		const files = await fs.readdir(this.folder, {
			recursive: true,
		});
		const collections = files
			.filter(file => file.endsWith(".edb"))
			.map(file => file.slice(0, -4));
		return collections;
	}

	async ensureCollection(collection: string) {
		if (await this.issetCollection(collection)) return false;

		const collectionFolder = join(this.folder, dirname(collection + ".edb"));
		await mkdir(collectionFolder, {
			recursive: true,
		});

		await this._write(collection, []);
		return true;
	}

	async issetCollection(collection: string) {
		const filePath = join(this.folder, collection + ".edb");
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	async removeCollection(collection: string) {
		const filePath = join(this.folder, collection + ".edb");
		try {
			await fs.unlink(filePath);
			return true;
		} catch {
			return true;
		}
	}
}
