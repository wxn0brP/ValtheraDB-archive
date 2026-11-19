import { Database } from "bun:sqlite";
import { SQLiteAdapter } from "../src/index";
import { TABLES } from "./tables";

export default async () => {
	const sqlDB = new Database(":memory:");

	for (const table of TABLES) sqlDB.prepare(table).run();

	const actions = new SQLiteAdapter(sqlDB);
	actions._inited = true;
	return actions;
};
