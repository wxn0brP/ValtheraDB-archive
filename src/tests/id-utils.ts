import { ValtheraClass } from "@wxn0brp/db-core";
import type { TestDefinition } from "../types";

export const idUtilsTests: TestDefinition[] = [
	{
		domain: "edge-cases",
		name: "auto-id-is-unique",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			const ids = new Set<string>();
			for (let i = 0; i < 100; i++) {
				const doc = await db.add<any>({
					collection: "items",
					data: {
						val: i,
					},
				});
				ids.add(doc._id);
			}
			if (ids.size !== 100)
				throw new Error("unique ids: expected 100 unique IDs, got " + ids.size);
		},
	},
	{
		domain: "edge-cases",
		name: "manual-id-override",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "my-custom-id",
					name: "test",
				},
			});
			const result = await db.findOne({
				collection: "items",
				search: {
					_id: "my-custom-id",
				},
			});
			if (!result)
				throw new Error("manual id: should find document by custom _id");
			if (result._id !== "my-custom-id")
				throw new Error("manual id: _id mismatch");
		},
	},
	{
		domain: "edge-cases",
		name: "add-with-number-id",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			const doc = await db.add<any>({
				collection: "items",
				data: {
					_id: 42,
					name: "num",
				},
			});
			if (doc._id !== 42)
				throw new Error("number id: expected _id 42, got " + doc._id);
			const found = await db.findOne<any>({
				collection: "items",
				search: {
					_id: 42,
				},
			});
			if (!found) throw new Error("number id: should find by numeric _id");
		},
	},
	{
		domain: "edge-cases",
		name: "find-by-id-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "aaa",
					val: 1,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "bbb",
					val: 2,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "ccc",
					val: 3,
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					_id: "bbb",
				},
			});
			if (results.length !== 1)
				throw new Error("find by id: expected 1 result");
			if (results[0]._id !== "bbb")
				throw new Error("find by id: wrong document");
		},
	},
];
