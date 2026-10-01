import { genId, ValtheraClass } from "@wxn0brp/db-core";
import { ActionsBase } from "@wxn0brp/db-core/base/actions";
import { Data } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import odbc from "odbc";
import { find } from "./find";
import { remove } from "./remove";
import { SupportedDB } from "./types";
import { update } from "./update";
import { escapeValue } from "./utils";

export class AccDBValthera extends ActionsBase {
	_inited = true;

	constructor(
		public db: SupportedDB,
		public primaryKey: Record<string, string> = {},
	) {
		super();
	}

	async close() {
		await this.db.close();
	}

	async getCollections(): Promise<string[]> {
		const result = await this.db.tables(null, null, null, "TABLE");
		return result.map((row: any) => row.TABLE_NAME || row.table_name);
	}

	async add(config: VQueryT.Add): Promise<Data> {
		const { data, id_gen = true, collection } = config;

		if (id_gen && !data._id) data._id = genId();

		const keys = Object.keys(data);
		const values = keys.map(k => escapeValue(data[k]));
		const sql = `INSERT INTO [${collection}] (${keys.map(k => `[${k}]`).join(", ")}) VALUES (${values.join(", ")})`;

		await this.db.query(sql);
		return data;
	}

	find(config: VQueryT.Find) {
		return find(this, config);
	}

	async findOne(config: VQueryT.Find) {
		config.dbFindOpts = {
			limit: 1,
		};
		const result = await this.find(config);
		return result.length ? result[0] : null;
	}

	update(config: VQueryT.Update) {
		return update(this, config, false);
	}

	async updateOne(config: VQueryT.Update) {
		const res = await update(this, config, true);
		return res[0] || null;
	}

	remove(config: VQueryT.Remove) {
		return remove(this, config, false);
	}

	async removeOne(config: VQueryT.Remove) {
		const res = await remove(this, config, true);
		return res[0] || null;
	}

	async removeCollection(collection: string) {
		const sql = `DROP TABLE [${collection}]`;
		await this.db.query(sql);
		return true;
	}

	async issetCollection(collection: string) {
		try {
			const sql = `SELECT TOP 1 * FROM [${collection}]`;
			await this.db.query(sql);
			return true;
		} catch (e) {
			return false;
		}
	}

	async ensureCollection(collection: string) {
		const issetCollection = await this.issetCollection(collection);
		if (!issetCollection)
			throw new Error(
				`Collection "${collection}" not found. Please create it first.`,
			);

		return true;
	}
}

export function createAccDBValthera(
	db: SupportedDB,
	primaryKey: Record<string, string> = {},
) {
	const adapter = new AccDBValthera(db, primaryKey);
	return new ValtheraClass({
		adapter,
	});
}

export function makeConnect(file: string) {
	return odbc.connect(
		`Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=${file}`,
	);
}

export const DYNAMIC = {
	async accdb(file: string, keys: Record<string, string> = {}) {
		return createAccDBValthera(await makeConnect(file), keys);
	},
};
