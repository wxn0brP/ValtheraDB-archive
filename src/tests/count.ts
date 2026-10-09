import { ValtheraClass } from "@wxn0brp/db-core";
import type { TestDefinition } from "../types";

export const countTests: TestDefinition[] = [
	{
		domain: "crud-read",
		name: "count-all-documents",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("users");
			await db.add({
				collection: "users",
				data: {
					name: "A",
					age: 20,
				},
			});
			await db.add({
				collection: "users",
				data: {
					name: "B",
					age: 25,
				},
			});
			await db.add({
				collection: "users",
				data: {
					name: "C",
					age: 30,
				},
			});
			const beforeCount = await db.count({
				collection: "users",
				search: {},
			});
			const count = await db.count({
				collection: "users",
				search: {},
			});
			if (count < beforeCount) throw new Error("Count should be consistent");
			if (count < 3)
				throw new Error("Expected at least 3 documents, got: " + count);
		},
	},
	{
		domain: "crud-read",
		name: "count-with-search-filter",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					name: "Apple",
					status: "fruit",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Banana",
					status: "fruit",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Carrot",
					status: "vegetable",
				},
			});
			const count = await db.count({
				collection: "items",
				search: {
					status: "fruit",
				},
			});
			if (count < 2)
				throw new Error("Expected at least 2 fruits, got: " + count);
		},
	},
	{
		domain: "crud-read",
		name: "count-with-no-matches",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					name: "Item1",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Item2",
				},
			});
			const count = await db.count({
				collection: "items",
				search: {
					name: "NonExistent",
				},
			});
			if (count !== 0)
				throw new Error("Expected count 0 for no matches, got: " + count);
		},
	},
	{
		domain: "crud-read",
		name: "count-empty-collection",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("test");
			const beforeCount = await db.count({
				collection: "test",
				search: {},
			});
			const count = await db.count({
				collection: "test",
				search: {},
			});
			if (count !== beforeCount)
				throw new Error("Empty collection count should be consistent");
		},
	},
	{
		domain: "crud-read",
		name: "count-after-remove",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("users");
			await db.add({
				collection: "users",
				data: {
					name: "A",
					age: 20,
				},
			});
			await db.add({
				collection: "users",
				data: {
					name: "B",
					age: 25,
				},
			});
			await db.add({
				collection: "users",
				data: {
					name: "C",
					age: 30,
				},
			});
			let count = await db.count({
				collection: "users",
				search: {},
			});
			if (count < 3) throw new Error("Expected at least 3 before remove");
			const beforeRemove = count;
			await db.remove({
				collection: "users",
				search: {
					name: "B",
				},
			});
			count = await db.count({
				collection: "users",
				search: {},
			});
			if (count !== beforeRemove - 1)
				throw new Error(
					"Expected count to decrease by 1 after removing 1 document, got: " +
						count,
				);
		},
	},
	{
		domain: "crud-read",
		name: "count-after-update",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					status: "active",
					val: 1,
				},
			});
			await db.add({
				collection: "items",
				data: {
					status: "active",
					val: 2,
				},
			});
			await db.add({
				collection: "items",
				data: {
					status: "inactive",
					val: 3,
				},
			});
			let count = await db.count({
				collection: "items",
				search: {
					status: "active",
				},
			});
			if (count < 2)
				throw new Error("Expected at least 2 active items before update");
			const beforeUpdate = count;
			await db.update({
				collection: "items",
				search: {
					val: 1,
				},
				updater: {
					status: "inactive",
				},
			});
			count = await db.count({
				collection: "items",
				search: {
					status: "active",
				},
			});
			if (count !== beforeUpdate - 1)
				throw new Error(
					"Expected active count to decrease by 1 after update, got: " + count,
				);
		},
	},
	{
		domain: "crud-read",
		name: "count-with-operators",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					val: 5,
				},
			});
			await db.add({
				collection: "items",
				data: {
					val: 10,
				},
			});
			await db.add({
				collection: "items",
				data: {
					val: 15,
				},
			});
			await db.add({
				collection: "items",
				data: {
					val: 20,
				},
			});
			const count = await db.count({
				collection: "items",
				search: {
					$gt: {
						val: 10,
					},
				},
			});
			if (count < 2)
				throw new Error(
					"Expected at least 2 items with val > 10, got: " + count,
				);
		},
	},
	{
		domain: "crud-read",
		name: "count-with-bulk-add",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.bulkAdd({
				collection: "items",
				datas: [
					{
						status: "a",
					},
					{
						status: "b",
					},
					{
						status: "a",
					},
					{
						status: "c",
					},
				],
			});
			let count = await db.count({
				collection: "items",
				search: {},
			});
			if (count < 4)
				throw new Error(
					"Expected at least 4 items after bulkAdd, got: " + count,
				);
			count = await db.count({
				collection: "items",
				search: {
					status: "a",
				},
			});
			if (count < 2)
				throw new Error(
					"Expected at least 2 items with status 'a', got: " + count,
				);
		},
	},
];
