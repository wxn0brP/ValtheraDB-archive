import { ValtheraClass } from "@wxn0brp/db-core";
import { createFileAdapter } from "@wxn0brp/db-storage-dir";
import { ConduitError } from "./errors";

interface DbSlot {
	db: ValtheraClass;
	lock: Promise<unknown>;
}

export class DbRegistry {
	_dbs = new Map<string, DbSlot>();

	list() {
		return Array.from(this._dbs.keys());
	}

	async init(name: string, dir: string, opts: Record<string, any> = {}) {
		assertName(name);
		if (!dir || typeof dir !== "string")
			throw new ConduitError("INVALID_DIR", "dir must be a non-empty string");
		if (this._dbs.has(name))
			throw new ConduitError(
				"DB_EXISTS",
				`database "${name}" is already initialized`,
			);

		const db = new ValtheraClass({
			adapter: createFileAdapter(dir, opts),
			adapterOpts: {
				numberId: Boolean(opts.numberId),
			},
		});
		await db.init();
		this._dbs.set(name, {
			db,
			lock: Promise.resolve(),
		});
		return {
			name,
			dir,
		};
	}

	async close(name: string) {
		const slot = this._get(name);
		await this._withLock(name, () => slot.db.close());
		this._dbs.delete(name);
		return {
			name,
		};
	}

	async closeAll() {
		const names = this.list();
		await Promise.all(names.map(name => this.close(name)));
		return {
			closed: names,
		};
	}

	async execute(dbName: string, op: string, body: any) {
		return await this._withLock(dbName, async (db: any) => {
			if (!op || typeof op !== "string")
				throw new ConduitError("INVALID_OP", "op must be a non-empty string");
			if (typeof db[op] !== "function")
				throw new ConduitError(
					"INVALID_OP",
					`operation "${op}" does not exist`,
				);
			return body === undefined ? await db[op]() : await db[op](body);
		});
	}

	_get(name: string) {
		assertName(name);
		const slot = this._dbs.get(name);
		if (!slot)
			throw new ConduitError(
				"DB_NOT_FOUND",
				`database "${name}" is not initialized`,
			);
		return slot;
	}

	async _withLock<T>(name: string, fn: (db: ValtheraClass) => Promise<T>) {
		const slot = this._get(name);
		const run = slot.lock.then(() => fn(slot.db));
		slot.lock = run.catch(() => undefined);
		return await run;
	}
}

function assertName(name: string) {
	if (!name || typeof name !== "string")
		throw new ConduitError(
			"INVALID_DB_NAME",
			"database name must be a non-empty string",
		);
}
