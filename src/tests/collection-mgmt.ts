import { ValtheraClass } from "@wxn0brp/db-core";
import type { TestDefinition } from "../types";

export const collectionMgmtTests: TestDefinition[] = [
	{
		domain: "collection-management",
		name: "getCollections-empty",
		fn: async (db: ValtheraClass) => {
			const collections = await db.getCollections();
			if (!Array.isArray(collections))
				throw new Error("getCollections must return an array");
			if (collections.length !== 0)
				throw new Error(
					"Expected empty array, got: " + JSON.stringify(collections),
				);
		},
	},
	{
		domain: "collection-management",
		name: "ensureCollection-creates-new",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("test_coll");
			const collections = await db.getCollections();
			if (!collections.includes("test_coll"))
				throw new Error("Collection not found after ensureCollection");
		},
	},
	{
		domain: "collection-management",
		name: "ensureCollection-existing-preserves-data",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("test_coll");
			await db.c("test_coll").add({
				_id: "preserved",
				value: 42,
			});
			await db.ensureCollection("test_coll");
			const documents = await db.c("test_coll").find();
			if (documents.length !== 1 || documents[0].value !== 42)
				throw new Error("ensureCollection must preserve existing data");
		},
	},
	{
		domain: "collection-management",
		name: "issetCollection-exists",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("test_coll");
			const exists = await db.issetCollection("test_coll");
			if (exists !== true)
				throw new Error(
					"issetCollection should return true for existing collection",
				);
		},
	},
	{
		domain: "collection-management",
		name: "issetCollection-not-exists",
		fn: async (db: ValtheraClass) => {
			const exists = await db.issetCollection("nonexistent");
			if (exists !== false)
				throw new Error(
					"issetCollection should return false for nonexistent collection",
				);
		},
	},
	{
		domain: "collection-management",
		name: "removeCollection-exists",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("to_remove");
			const removed = await db.removeCollection("to_remove");
			if (removed !== true)
				throw new Error("removeCollection should return true");
			const exists = await db.issetCollection("to_remove");
			if (exists !== false)
				throw new Error("Collection should not exist after removal");
		},
	},
];
