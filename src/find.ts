import { Data } from "@wxn0brp/db-core/types/data";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { findUtil } from "@wxn0brp/db-core/utils/action";
import { findObj } from "@wxn0brp/db-core/utils/process";
import { MariaDBValthera } from "./actions";
import { rowToData } from "./storage/row";
import { getColumns } from "./storage/schema";
import { buildWhere } from "./storage/where";

export async function find(
	mv: MariaDBValthera,
	config: VQueryT.Find,
): Promise<Data[]> {
	const { collection } = config;
	await mv.ensureCollection(collection);

	const columns = await getColumns(mv, collection);
	const where = await buildWhere(mv, collection, config);
	const primaryKey = mv.primaryKey(collection);
	const search = (config as any).search;

	const rows = await mv.query<Record<string, any>>(
		`SELECT * FROM ${mv.table(collection)} ${where.sql}`,
		where.values,
	);

	const docs = rows
		.map(row => {
			const data = rowToData(row, columns, mv.compositeEncoding);

			if (search && typeof search === "object" && !Array.isArray(search)) {
				for (const [key, value] of Object.entries(search)) {
					if (key.startsWith("$")) continue;
					if (
						key === primaryKey &&
						typeof value === "number" &&
						typeof (data as any)[key] === "string"
					) {
						const num = Number((data as any)[key]);
						if (!Number.isNaN(num) && String(num) === (data as any)[key])
							(data as any)[key] = num;
					}
				}
			}

			return findObj(config, data);
		})
		.filter(Boolean) as Data[];

	return findUtil(config, docs, []);
}
