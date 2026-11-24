import { ValtheraClass } from "@wxn0brp/db-core";
import type { TestDefinition } from "../types";

export const updateOpTests: TestDefinition[] = [
	{
		domain: "update-operators",
		name: "inc-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					count: 10,
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$inc: {
						count: 5,
					},
				},
			});
			if (!result || result.count !== 15)
				throw new Error("$inc: expected count to be 15, got: " + result?.count);
		},
	},
	{
		domain: "update-operators",
		name: "unset-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					temp: "value",
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$unset: {
						temp: 1,
					},
				},
			});
			if (!result || "temp" in result)
				throw new Error("$unset: field should be removed");
		},
	},
	{
		domain: "update-operators",
		name: "push-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					tags: [
						"a",
					],
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$push: {
						tags: "b",
					},
				},
			});
			if (!result || !Array.isArray(result.tags) || result.tags.length !== 2) {
				throw new Error(
					"$push: expected 2 tags, got: " + JSON.stringify(result?.tags),
				);
			}
		},
	},
	{
		domain: "update-operators",
		name: "merge-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					settings: {
						theme: "light",
						lang: "en",
					},
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$merge: {
						settings: {
							theme: "dark",
						},
					},
				},
			});
			if (
				!result ||
				result.settings.theme !== "dark" ||
				result.settings.lang !== "en"
			) {
				throw new Error(
					"$merge: expected theme=dark, lang=en, got: " +
						JSON.stringify(result?.settings),
				);
			}
		},
	},
	{
		domain: "update-operators",
		name: "dec-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					count: 10,
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$dec: {
						count: 3,
					},
				},
			});
			if (!result || result.count !== 7)
				throw new Error("$dec: expected count to be 7, got: " + result?.count);
		},
	},
	{
		domain: "update-operators",
		name: "set-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					name: "old",
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$set: {
						name: "new",
					},
				},
			});
			if (!result || result.name !== "new")
				throw new Error("$set: expected name=new, got: " + result?.name);
		},
	},
	{
		domain: "update-operators",
		name: "rename-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					oldName: "value",
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$rename: {
						oldName: "newName",
					},
				},
			});
			if (!result || "oldName" in result)
				throw new Error("$rename: oldName should be removed");
			if (result.newName !== "value")
				throw new Error("$rename: newName should have the old value");
		},
	},
	{
		domain: "update-operators",
		name: "pushSet-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					tags: [
						"a",
						"b",
					],
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$pushSet: {
						tags: [
							"b",
							"c",
						],
					},
				},
			});
			if (!result || !Array.isArray(result.tags) || result.tags.length !== 3) {
				throw new Error(
					"$pushSet: expected 3 tags, got: " + JSON.stringify(result?.tags),
				);
			}
		},
	},
	{
		domain: "update-operators",
		name: "pushAll-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					tags: [
						"a",
					],
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$pushAll: {
						tags: [
							"b",
							"c",
						],
					},
				},
			});
			if (!result || !Array.isArray(result.tags) || result.tags.length !== 3) {
				throw new Error(
					"$pushAll: expected 3 tags, got: " + JSON.stringify(result?.tags),
				);
			}
		},
	},
	{
		domain: "update-operators",
		name: "pull-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					tags: [
						"a",
						"b",
						"c",
					],
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$pull: {
						tags: "b",
					},
				},
			});
			if (!result || !Array.isArray(result.tags) || result.tags.length !== 2) {
				throw new Error(
					"$pull: expected 2 tags, got: " + JSON.stringify(result?.tags),
				);
			}
			if (result.tags.includes("b"))
				throw new Error("$pull: b should be removed");
		},
	},
	{
		domain: "update-operators",
		name: "pullAll-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					tags: [
						"a",
						"b",
						"c",
						"d",
					],
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$pullAll: {
						tags: [
							"b",
							"d",
						],
					},
				},
			});
			if (!result || !Array.isArray(result.tags) || result.tags.length !== 2) {
				throw new Error(
					"$pullAll: expected 2 tags, got: " + JSON.stringify(result?.tags),
				);
			}
			if (result.tags.includes("b") || result.tags.includes("d")) {
				throw new Error("$pullAll: b and d should be removed");
			}
		},
	},
	{
		domain: "update-operators",
		name: "deepMerge-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					nested: {
						a: 1,
						b: {
							c: 2,
						},
					},
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$deepMerge: {
						nested: {
							b: {
								d: 3,
							},
						},
					},
				},
			});
			if (!result) throw new Error("$deepMerge: result should exist");
			if (result.nested.a !== 1)
				throw new Error("$deepMerge: a should be preserved");
			if (result.nested.b.c !== 2)
				throw new Error("$deepMerge: b.c should be preserved");
			if (result.nested.b.d !== 3)
				throw new Error("$deepMerge: b.d should be added");
		},
	},
	{
		domain: "update-operators",
		name: "case-insensitive-PUSH",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					tags: [
						"a",
					],
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$PUSH: {
						tags: "b",
					},
				},
			});
			if (!result || !Array.isArray(result.tags) || result.tags.length !== 2) {
				throw new Error(
					"$PUSH: expected 2 tags, got: " + JSON.stringify(result?.tags),
				);
			}
		},
	},
	{
		domain: "update-operators",
		name: "case-insensitive-INC",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					count: 10,
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$INC: {
						count: 5,
					},
				},
			});
			if (!result || result.count !== 15)
				throw new Error("$INC: expected count 15, got: " + result?.count);
		},
	},
	{
		domain: "update-operators",
		name: "deprecated-pushset-alias",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					tags: [
						"a",
						"b",
					],
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$pushset: {
						tags: [
							"b",
							"c",
						],
					},
				},
			});
			if (!result || !Array.isArray(result.tags) || result.tags.length !== 3) {
				throw new Error(
					"$pushset: expected 3 tags, got: " + JSON.stringify(result?.tags),
				);
			}
		},
	},
	{
		domain: "update-operators",
		name: "deprecated-pushall-alias",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					tags: [
						"a",
					],
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$pushall: {
						tags: [
							"b",
							"c",
						],
					},
				},
			});
			if (!result || !Array.isArray(result.tags) || result.tags.length !== 3) {
				throw new Error(
					"$pushall: expected 3 tags, got: " + JSON.stringify(result?.tags),
				);
			}
		},
	},
	{
		domain: "update-operators",
		name: "deprecated-pullall-alias",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					tags: [
						"a",
						"b",
						"c",
						"d",
					],
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$pullall: {
						tags: [
							"b",
							"d",
						],
					},
				},
			});
			if (!result || !Array.isArray(result.tags) || result.tags.length !== 2) {
				throw new Error(
					"$pullall: expected 2 tags, got: " + JSON.stringify(result?.tags),
				);
			}
		},
	},
	{
		domain: "update-operators",
		name: "update-multi-doc-with-inc",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					type: "a",
					count: 1,
				},
			});
			await db.add({
				collection: "items",
				data: {
					type: "a",
					count: 2,
				},
			});
			await db.add({
				collection: "items",
				data: {
					type: "b",
					count: 10,
				},
			});
			await db.update({
				collection: "items",
				search: {
					type: "a",
				},
				updater: {
					$inc: {
						count: 100,
					},
				},
			});
			const results = await db.find<any>({
				collection: "items",
				search: {
					type: "a",
				},
			});
			if (results.length !== 2)
				throw new Error("update multi: expected 2 results");
			if (!results.every((r: any) => r.count >= 100))
				throw new Error(
					"update multi: all type-a docs should have count >= 100",
				);
		},
	},
	{
		domain: "update-operators",
		name: "pull-multiple-values",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "i1",
					scores: [
						10,
						20,
						30,
						40,
					],
				},
			});
			const result = await db.updateOne<any>({
				collection: "items",
				search: {
					_id: "i1",
				},
				updater: {
					$pullAll: {
						scores: [
							20,
							40,
						],
					},
				},
			});
			if (!result || !Array.isArray(result.scores))
				throw new Error("$pullAll multi: expected array result");
			if (result.scores.length !== 2)
				throw new Error(
					"$pullAll multi: expected 2 remaining, got: " + result.scores.length,
				);
			if (result.scores[0] !== 10 || result.scores[1] !== 30)
				throw new Error("$pullAll multi: wrong elements remaining");
		},
	},
];
