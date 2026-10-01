import {
	randomBytes,
	scryptSync,
	createCipheriv,
	createDecipheriv,
} from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface KeyStoreOptions {
	folder: string;
	keyFile?: string;
	saltFile?: string;
}

export class KeyStore {
	private folder: string;
	private keyFile: string;
	private saltFile: string;

	private masterKey?: Buffer;

	constructor(options: KeyStoreOptions) {
		this.folder = options.folder;
		this.keyFile = options.keyFile ?? "keystore.edb";
		this.saltFile = options.saltFile ?? "keystore.salt";

		if (!existsSync(this.folder)) {
			mkdirSync(this.folder, {
				recursive: true,
			});
		}
	}

	init(password: string): void {
		if (this.exists()) {
			throw new Error("Keystore already exists");
		}

		const salt = randomBytes(16);
		const masterKey = randomBytes(32);

		const kek = this._deriveKey(password, salt);
		const encrypted = this._encryptMasterKey(masterKey, kek);

		writeFileSync(join(this.folder, this.saltFile), salt, {
			mode: 0o600,
		});
		writeFileSync(join(this.folder, this.keyFile), encrypted, {
			mode: 0o600,
		});

		this.masterKey = masterKey;
	}

	unlock(password: string): Buffer {
		if (this.masterKey) return this.masterKey;

		const salt = readFileSync(join(this.folder, this.saltFile));
		const encrypted = readFileSync(join(this.folder, this.keyFile));

		const kek = this._deriveKey(password, salt);
		const masterKey = this._decryptMasterKey(encrypted, kek);

		this.masterKey = masterKey;
		return masterKey;
	}

	lock(): void {
		this.masterKey?.fill(0);
		this.masterKey = undefined;
	}

	exists(): boolean {
		return (
			existsSync(join(this.folder, this.keyFile)) &&
			existsSync(join(this.folder, this.saltFile))
		);
	}

	getKey(): Buffer {
		if (!this.masterKey) {
			throw new Error("Keystore is locked");
		}
		return this.masterKey;
	}

	_deriveKey(password: string, salt: Buffer): Buffer {
		return scryptSync(password, salt, 32);
	}

	_encryptMasterKey(masterKey: Buffer, kek: Buffer): Buffer {
		const iv = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", kek, iv);

		const encrypted = Buffer.concat([
			cipher.update(masterKey),
			cipher.final(),
		]);

		const tag = cipher.getAuthTag();

		return Buffer.concat([
			iv,
			tag,
			encrypted,
		]);
	}

	_decryptMasterKey(payload: Buffer, kek: Buffer): Buffer {
		if (payload.length < 28) {
			throw new Error("Invalid keystore payload");
		}

		const iv = payload.subarray(0, 12);
		const tag = payload.subarray(12, 28);
		const encrypted = payload.subarray(28);

		const decipher = createDecipheriv("aes-256-gcm", kek, iv);
		decipher.setAuthTag(tag);

		return Buffer.concat([
			decipher.update(encrypted),
			decipher.final(),
		]);
	}
}
