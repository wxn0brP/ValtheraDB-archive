import { ValtheraClass } from "@wxn0brp/db-core";
import type { TestDefinition } from "../types";

export const searchAdvancedTests: TestDefinition[] = [
	{
		domain: "search-operators",
		name: "not-with-exists-false",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					name: "A",
					extra: 1,
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "B",
				},
			});
			const results = await db.find<any>({
				collection: "items",
				search: {
					$not: {
						$exists: {
							extra: false,
						},
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$not with $exists false: expected 1 result");
			if (results[0].name !== "A")
				throw new Error("$not with $exists false: wrong document");
		},
	},
	{
		domain: "search-operators",
		name: "and-with-or-nested",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					type: "x",
					status: "active",
				},
			});
			await db.add({
				collection: "items",
				data: {
					type: "y",
					status: "active",
				},
			});
			await db.add({
				collection: "items",
				data: {
					type: "x",
					status: "inactive",
				},
			});
			await db.add({
				collection: "items",
				data: {
					type: "z",
					status: "active",
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$and: [
						{
							$or: [
								{
									type: "x",
								},
								{
									type: "y",
								},
							],
						},
						{
							status: "active",
						},
					],
				},
			});
			if (results.length !== 2)
				throw new Error(
					"nested $and+$or: expected 2 results, got: " + results.length,
				);
		},
	},
	{
		domain: "search-operators",
		name: "regex-with-flags",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					name: "HELLO world",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "test",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "another",
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$regex: {
						name: /^hello/i,
					},
				},
			});
			if (results.length !== 1)
				throw new Error(
					"$regex with i flag: expected 1 result, got: " + results.length,
				);
		},
	},
	{
		domain: "search-operators",
		name: "search-on-empty-collection",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("empty_coll");
			const results = await db.find({
				collection: "empty_coll",
				search: {
					any: "field",
				},
			});
			if (!Array.isArray(results))
				throw new Error("search on empty: should return array");
			if (results.length !== 0)
				throw new Error("search on empty: expected 0 results");
		},
	},
];
