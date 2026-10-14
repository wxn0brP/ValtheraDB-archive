import {
	FileHandle,
	mkdir,
	open,
	readdir,
	readFile,
	rm,
	stat,
} from "fs/promises";
import { decodeRecord, encodeDataRecord, encodeTombstone } from "./record";
import { AnyRecord } from "./types";
import { join } from "path";

export class SegmentManager {
	private _activeFh: Map<string, FileHandle> = new Map();
	private _activeOffset: Map<string, number> = new Map();

	constructor(private rootDir: string) {}

	private _collectionDir(collection: string) {
		return join(this.rootDir, collection);
	}

	private _segmentPath(collection: string, index: number) {
		return join(
			this._collectionDir(collection),
			`seg-${String(index).padStart(6, "0")}.log`,
		);
	}

	async ensureCollection(collection: string) {
		const dir = this._collectionDir(collection);
		await mkdir(dir, {
			recursive: true,
		});
	}

	async issetCollection(collection: string) {
		try {
			const s = await stat(this._collectionDir(collection));
			return s.isDirectory();
		} catch {
			return false;
		}
	}

	async getCollections() {
		try {
			const entries = await readdir(this.rootDir, {
				withFileTypes: true,
			});
			return entries.filter(e => e.isDirectory()).map(e => e.name);
		} catch {
			return [];
		}
	}

	async removeCollection(collection: string) {
		const dir = this._collectionDir(collection);
		const fh = this._activeFh.get(collection);
		if (fh) {
			await fh.close();
		}
		this._activeFh.delete(collection);
		this._activeOffset.delete(collection);
		await rm(dir, {
			recursive: true,
			force: true,
		});
	}

	private async _getNextSegmentIndex(collection: string) {
		const dir = this._collectionDir(collection);
		try {
			const files = await readdir(dir);
			const segments = files.filter(
				f => f.startsWith("seg-") && f.endsWith(".log"),
			);
			if (segments.length === 0) return 0;
			const nums = segments.map(f => parseInt(f.slice(4, -4), 10));
			return Math.max(...nums) + 1;
		} catch {
			return 0;
		}
	}

	private async _getActiveHandle(collection: string) {
		let fh = this._activeFh.get(collection);
		if (fh) {
			return {
				fh,
				offset: this._activeOffset.get(collection) ?? 0,
			};
		}

		const index = await this._getNextSegmentIndex(collection);
		const segPath = this._segmentPath(collection, index);

		await this.ensureCollection(collection);

		fh = await open(segPath, "a");
		const stat = await fh.stat();
		const offset = stat.size;

		this._activeFh.set(collection, fh);
		this._activeOffset.set(collection, offset);

		return {
			fh,
			offset,
		};
	}

	async appendDataRecord(collection: string, _id: string, l: string) {
		const buf = encodeDataRecord(_id, l);
		const { fh, offset } = await this._getActiveHandle(collection);
		await fh.write(buf, 0, buf.length, offset);
		this._activeOffset.set(collection, offset + buf.length);
	}

	async appendTombstone(collection: string, _id: string) {
		const buf = encodeTombstone(_id);
		const { fh, offset } = await this._getActiveHandle(collection);
		await fh.write(buf, 0, buf.length, offset);
		this._activeOffset.set(collection, offset + buf.length);
	}

	async appendDataRecords(
		collection: string,
		records: {
			_id: string;
			l: string;
		}[],
	) {
		const buffers = records.map(r => encodeDataRecord(r._id, r.l));
		const combined = Buffer.concat(buffers);
		const { fh, offset } = await this._getActiveHandle(collection);
		await fh.write(combined, 0, combined.length, offset);
		this._activeOffset.set(collection, offset + combined.length);
	}

	async scanCollection(collection: string) {
		const dir = this._collectionDir(collection);
		let files: string[];
		try {
			files = await readdir(dir);
		} catch {
			return [];
		}

		const segments = files
			.filter(f => f.startsWith("seg-") && f.endsWith(".log"))
			.sort();
		const records: AnyRecord[] = [];

		for (const seg of segments) {
			const segPath = join(dir, seg);
			const data = await readFile(segPath);
			let offset = 0;
			while (offset < data.length) {
				try {
					const { record, bytesRead } = decodeRecord(data, offset);
					records.push(record);
					offset += bytesRead;
				} catch {
					break;
				}
			}
		}

		return records;
	}

	async close() {
		const closePromises = [];
		for (const [collection, fh] of this._activeFh) {
			closePromises.push(fh.close().catch(() => {}));
		}
		await Promise.all(closePromises);
		this._activeFh.clear();
		this._activeOffset.clear();
	}
}
