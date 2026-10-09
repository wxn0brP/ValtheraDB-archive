import { ValtheraClass } from "@wxn0brp/db-core";
import type { TestDefinition } from "../types";

export const bulkAddTests: TestDefinition[] = [
	{
		domain: "crud-add",
		name: "bulk-add-multiple-documents",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("users");
			const docs = await db.bulkAdd<any>({
				collection: "users",
				datas: [
					{
						name: "Item1",
						age: 10,
					},
					{
						name: "Item2",
						age: 20,
					},
					{
						name: "Item3",
						age: 30,
					},
				],
			});
			if (docs.length !== 3)
				throw new Error(
					"bulkAdd should return 3 documents, got: " + docs.length,
				);
			for (const doc of docs) {
				if (!doc._id)
					throw new Error("Each document should have auto-generated _id");
			}
			const all = await db.find({
				collection: "users",
			});
			if (all.length < 3)
				throw new Error(
					"Expected at least 3 documents in collection, got: " + all.length,
				);
		},
	},
	{
		domain: "crud-add",
		name: "bulk-add-with-id-gen-false",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("test");
			const docs = await db.bulkAdd<any>({
				collection: "test",
				datas: [
					{
						name: "A",
					},
					{
						name: "B",
					},
				],
				id_gen: false,
			});
			if (docs.length !== 2)
				throw new Error("bulkAdd should return 2 documents");
			for (const doc of docs) {
				if (doc._id !== undefined)
					throw new Error("Documents should not have _id when id_gen: false");
			}
		},
	},
	{
		domain: "crud-add",
		name: "bulk-add-with-manual-ids",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("users");
			const docs = await db.bulkAdd<any>({
				collection: "users",
				datas: [
					{
						_id: "user-1",
						name: "Alice",
						age: 25,
					},
					{
						_id: "user-2",
						name: "Bob",
						age: 30,
					},
				],
			});
			if (docs.length !== 2)
				throw new Error("bulkAdd should return 2 documents");
			if (docs[0]._id !== "user-1")
				throw new Error("First document should have _id 'user-1'");
			if (docs[1]._id !== "user-2")
				throw new Error("Second document should have _id 'user-2'");
			const alice = await db.findOne<{
				_id: string;
				name: string;
			}>({
				collection: "users",
				search: {
					_id: "user-1",
				},
			});
			if (!alice || alice.name !== "Alice")
				throw new Error("Document with manual _id not found");
		},
	},
	{
		domain: "crud-add",
		name: "bulk-add-empty-array",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("test");
			const docs = await db.bulkAdd<any>({
				collection: "test",
				datas: [],
			});
			if (docs.length !== 0)
				throw new Error("bulkAdd with empty array should return empty array");
			const count = await db.count({
				collection: "test",
				search: {},
			});
			if (count < 0) throw new Error("Collection count should be >= 0");
		},
	},
	{
		domain: "crud-add",
		name: "bulk-add-data-integrity",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.bulkAdd<any>({
				collection: "items",
				datas: [
					{
						name: "Product A",
						val: 100,
						status: "active",
					},
					{
						name: "Product B",
						val: 200,
						status: "active",
					},
					{
						name: "Product C",
						val: 150,
						status: "inactive",
					},
				],
			});
			const products = await db.find({
				collection: "items",
			});
			if (products.length < 3)
				throw new Error("Expected at least 3 items, got: " + products.length);
			const productA = products.find(p => p.name === "Product A");
			if (!productA || productA.val !== 100 || productA.status !== "active")
				throw new Error("Product A data mismatch");
			const productB = products.find(p => p.name === "Product B");
			if (!productB || productB.val !== 200 || productB.status !== "active")
				throw new Error("Product B data mismatch");
			const productC = products.find(p => p.name === "Product C");
			if (!productC || productC.val !== 150 || productC.status !== "inactive")
				throw new Error("Product C data mismatch");
		},
	},
	{
		domain: "crud-add",
		name: "bulk-add-verify-all-returned",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			const returned = await db.bulkAdd<any>({
				collection: "items",
				datas: [
					{
						name: "order-1001",
						val: 1001,
					},
					{
						name: "order-1002",
						val: 1002,
					},
					{
						name: "order-1003",
						val: 1003,
					},
				],
			});
			const vals = returned.map(r => r.val).sort();
			if (vals[0] !== 1001 || vals[1] !== 1002 || vals[2] !== 1003)
				throw new Error("bulkAdd should return all added documents");
			const found = await db.find({
				collection: "items",
			});
			const foundVals = found
				.filter(f =>
					[
						1001,
						1002,
						1003,
					].includes(f.val),
				)
				.map(f => f.val)
				.sort();
			if (
				foundVals[0] !== 1001 ||
				foundVals[1] !== 1002 ||
				foundVals[2] !== 1003
			)
				throw new Error("All documents should be findable after bulkAdd");
		},
	},
];
