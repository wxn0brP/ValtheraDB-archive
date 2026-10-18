import { Data } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { findUtil } from "@wxn0brp/db-core/utils/action";
import { findObj } from "@wxn0brp/db-core/utils/process";
import { PostgreSQLValthera } from "./actions";
import { rowToData } from "./storage/row";
import { getColumns } from "./storage/schema";
import { buildWhere } from "./storage/where";
import { POSTGRES_STORAGE_ID } from "./types";

export async function find(
	pgv: PostgreSQLValthera,
	config: VQueryT.Find,
): Promise<Data[]> {
	const { collection } = config;
	await pgv.ensureCollection(collection);
	const columns = await getColumns(pgv, collection);
	const where = await buildWhere(pgv, collection, config);
	const primaryKey = pgv.primaryKey(collection);

	const result = await pgv.query<Record<string, any>>(
		`SELECT * FROM ${pgv.table(collection)} ${where.sql} ORDER BY ctid`,
		where.values,
	);

	const docs = result.rows
		.map(row => {
			const data = rowToData(row, columns);
			const search = (config as any).search;
			if (search && typeof search === "object" && !Array.isArray(search)) {
				for (const [key, value] of Object.entries(search)) {
					if (!key.startsWith("$") && value === null && row[key] === null) {
						(data as any)[key] = null;
					}
					if (
						key === primaryKey &&
						typeof value === "number" &&
						typeof (data as any)[key] === "string"
					) {
						const num = Number((data as any)[key]);
						if (
							!Number.isNaN(num) &&
							Number.isFinite(num) &&
							String(num) === (data as any)[key]
						) {
							(data as any)[key] = num;
						}
					}
				}
			}
			Object.defineProperty(data, POSTGRES_STORAGE_ID, {
				value: row[primaryKey],
				enumerable: false,
				configurable: true,
			});
			return findObj(config, data);
		})
		.filter(Boolean) as Data[];

	return findUtil(config, docs, []);
}
