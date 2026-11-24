import { ValtheraClass } from "@wxn0brp/db-core";
import type { TestDefinition } from "../types";

export const searchOpTests: TestDefinition[] = [
	{
		domain: "search-operators",
		name: "comparison-gt",
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
			const results = await db.find({
				collection: "items",
				search: {
					$gt: {
						val: 7,
					},
				},
			});
			if (results.length !== 2)
				throw new Error("$gt: expected 2 results, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "comparison-lt",
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
			const results = await db.find({
				collection: "items",
				search: {
					$lt: {
						val: 12,
					},
				},
			});
			if (results.length !== 2)
				throw new Error("$lt: expected 2 results, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "comparison-in",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					status: "a",
				},
			});
			await db.add({
				collection: "items",
				data: {
					status: "b",
				},
			});
			await db.add({
				collection: "items",
				data: {
					status: "c",
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$in: {
						status: [
							"a",
							"c",
						],
					},
				},
			});
			if (results.length !== 2)
				throw new Error("$in: expected 2 results, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "exists-true",
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
			const results = await db.find({
				collection: "items",
				search: {
					$exists: {
						extra: true,
					},
				},
			});
			if (results.length !== 1) throw new Error("$exists: expected 1 result");
		},
	},
	{
		domain: "search-operators",
		name: "exists-false",
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
			const results = await db.find({
				collection: "items",
				search: {
					$exists: {
						extra: false,
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$exists false: expected 1 result");
		},
	},
	{
		domain: "search-operators",
		name: "and-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					a: 1,
					b: 2,
				},
			});
			await db.add({
				collection: "items",
				data: {
					a: 1,
					b: 3,
				},
			});
			await db.add({
				collection: "items",
				data: {
					a: 2,
					b: 2,
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$and: [
						{
							a: 1,
						},
						{
							b: 2,
						},
					],
				},
			});
			if (results.length !== 1)
				throw new Error("$and: expected 1 result, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "comparison-gte",
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
			const results = await db.find({
				collection: "items",
				search: {
					$gte: {
						val: 10,
					},
				},
			});
			if (results.length !== 2)
				throw new Error("$gte: expected 2 results, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "comparison-lte",
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
			const results = await db.find({
				collection: "items",
				search: {
					$lte: {
						val: 10,
					},
				},
			});
			if (results.length !== 2)
				throw new Error("$lte: expected 2 results, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "comparison-nin",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					status: "a",
				},
			});
			await db.add({
				collection: "items",
				data: {
					status: "b",
				},
			});
			await db.add({
				collection: "items",
				data: {
					status: "c",
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$nin: {
						status: [
							"a",
							"c",
						],
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$nin: expected 1 result, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "comparison-between",
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
					val: 20,
				},
			});
			const results = await db.find<any>({
				collection: "items",
				search: {
					$between: {
						val: [
							8,
							15,
						],
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$between: expected 1 result, got: " + results.length);
			if (results[0].val !== 10)
				throw new Error("$between: wrong document returned");
		},
	},
	{
		domain: "search-operators",
		name: "or-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					a: 1,
					b: "x",
				},
			});
			await db.add({
				collection: "items",
				data: {
					a: 2,
					b: "y",
				},
			});
			await db.add({
				collection: "items",
				data: {
					a: 3,
					b: "z",
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$or: [
						{
							a: 1,
						},
						{
							b: "y",
						},
					],
				},
			});
			if (results.length !== 2)
				throw new Error("$or: expected 2 results, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "not-operator",
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
			const results = await db.find({
				collection: "items",
				search: {
					$not: {
						val: 10,
					},
				},
			});
			if (results.length !== 2)
				throw new Error("$not: expected 2 results, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "type-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					name: "Alice",
					age: 25,
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Bob",
					age: "unknown",
				},
			});
			const results = await db.find<any>({
				collection: "items",
				search: {
					$type: {
						age: "number",
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$type: expected 1 result, got: " + results.length);
			if (results[0].name !== "Alice")
				throw new Error("$type: wrong document returned");
		},
	},
	{
		domain: "search-operators",
		name: "regex-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					name: "John",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Jane",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Bob",
				},
			});
			const results = await db.find<any>({
				collection: "items",
				search: {
					$regex: {
						name: /Jo/,
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$regex: expected 1 result, got: " + results.length);
			if (results[0].name !== "John")
				throw new Error("$regex: wrong document returned");
		},
	},
	{
		domain: "search-operators",
		name: "starts-with-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					name: "John",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Jane",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Bob",
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$startsWith: {
						name: "J",
					},
				},
			});
			if (results.length !== 2)
				throw new Error(
					"$startsWith: expected 2 results, got: " + results.length,
				);
		},
	},
	{
		domain: "search-operators",
		name: "ends-with-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					name: "John",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Jean",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Bob",
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$endsWith: {
						name: "n",
					},
				},
			});
			if (results.length !== 2)
				throw new Error(
					"$endsWith: expected 2 results, got: " + results.length,
				);
		},
	},
	{
		domain: "search-operators",
		name: "case-insensitive-GT",
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
			const results = await db.find({
				collection: "items",
				search: {
					$GT: {
						val: 7,
					},
				},
			});
			if (results.length !== 2)
				throw new Error("$GT: expected 2 results, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "case-insensitive-IN",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					status: "a",
				},
			});
			await db.add({
				collection: "items",
				data: {
					status: "b",
				},
			});
			await db.add({
				collection: "items",
				data: {
					status: "c",
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$IN: {
						status: [
							"a",
							"c",
						],
					},
				},
			});
			if (results.length !== 2)
				throw new Error("$IN: expected 2 results, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "case-insensitive-EXISTS",
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
			const results = await db.find({
				collection: "items",
				search: {
					$EXISTS: {
						extra: true,
					},
				},
			});
			if (results.length !== 1) throw new Error("$EXISTS: expected 1 result");
		},
	},
	{
		domain: "search-operators",
		name: "deprecated-arrinc-alias",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					tags: [
						"a",
						"b",
						"c",
					],
				},
			});
			await db.add({
				collection: "items",
				data: {
					tags: [
						"d",
					],
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$arrinc: {
						tags: [
							"a",
						],
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$arrinc: expected 1 result, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "deprecated-arrincall-alias",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					tags: [
						"a",
						"b",
						"c",
					],
				},
			});
			await db.add({
				collection: "items",
				data: {
					tags: [
						"a",
						"b",
					],
				},
			});
			await db.add({
				collection: "items",
				data: {
					tags: [
						"a",
					],
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$arrincall: {
						tags: [
							"a",
							"b",
						],
					},
				},
			});
			if (results.length !== 2)
				throw new Error(
					"$arrincall: expected 2 results, got: " + results.length,
				);
		},
	},
	{
		domain: "search-operators",
		name: "arrInc-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					tags: [
						"a",
						"b",
						"c",
					],
				},
			});
			await db.add({
				collection: "items",
				data: {
					tags: [
						"b",
						"c",
					],
				},
			});
			await db.add({
				collection: "items",
				data: {
					tags: [
						"d",
					],
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$arrInc: {
						tags: [
							"a",
						],
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$arrInc: expected 1 result, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "arrIncAll-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					tags: [
						"a",
						"b",
						"c",
					],
				},
			});
			await db.add({
				collection: "items",
				data: {
					tags: [
						"a",
						"b",
					],
				},
			});
			await db.add({
				collection: "items",
				data: {
					tags: [
						"a",
					],
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$arrIncAll: {
						tags: [
							"a",
							"b",
						],
					},
				},
			});
			if (results.length !== 2)
				throw new Error(
					"$arrIncAll: expected 2 results, got: " + results.length,
				);
		},
	},
	{
		domain: "search-operators",
		name: "size-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					tags: [
						"a",
						"b",
					],
				},
			});
			await db.add({
				collection: "items",
				data: {
					tags: [
						"a",
						"b",
						"c",
					],
				},
			});
			await db.add({
				collection: "items",
				data: {
					tags: [
						"a",
					],
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$size: {
						tags: 2,
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$size: expected 1 result, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "idGt-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "id1",
					val: 1,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "id3",
					val: 3,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "id2",
					val: 2,
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$idGt: {
						_id: "id1",
					},
				},
			});
			if (results.length !== 2)
				throw new Error("$idGt: expected 2 results, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "idLt-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "id1",
					val: 1,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "id3",
					val: 3,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "id2",
					val: 2,
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$idLt: {
						_id: "id2",
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$idLt: expected 1 result, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "case-insensitive-IDGT",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "a1",
					val: 1,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "a3",
					val: 3,
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$IDGT: {
						_id: "a1",
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$IDGT: expected 1 result, got: " + results.length);
		},
	},
	{
		domain: "search-operators",
		name: "comparison-ne",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					status: "active",
				},
			});
			await db.add({
				collection: "items",
				data: {
					status: "banned",
				},
			});

			const results = await db.find<any>({
				collection: "items",
				search: {
					$ne: {
						status: "banned",
					},
				},
			});

			if (results.length !== 1) throw new Error("$ne: expected 1 result");
			if (results[0].status !== "active")
				throw new Error("$ne: wrong document");
		},
	},
	{
		domain: "search-operators",
		name: "case-insensitive-iStartsWith",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					name: "Dr. Smith",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "MR. Jones",
				},
			});

			const results = await db.find({
				collection: "items",
				search: {
					$iStartsWith: {
						name: "dr",
					},
				},
			});

			if (results.length !== 1)
				throw new Error("$iStartsWith: expected 1 result");
		},
	},
	{
		domain: "search-operators",
		name: "subset-operator-bypass",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					$lt: "John Doe",
					age: 20,
				},
			});
			await db.add({
				collection: "items",
				data: {
					$lt: "Jane",
					age: 25,
				},
			});

			const results = await db.find<any>({
				collection: "items",
				search: {
					$subset: {
						$lt: "John Doe",
					},
				},
			});

			if (results.length !== 1) throw new Error("$subset: expected 1 result");
			if (results[0].age !== 20)
				throw new Error("$subset: wrong document matched");
		},
	},
	{
		domain: "search-operators",
		name: "idGte-and-idLte-operators",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "id1",
					val: 1,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "id2",
					val: 2,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "id3",
					val: 3,
				},
			});

			const results = await db.find({
				collection: "items",
				search: {
					$idGte: {
						_id: "id2",
					},
					$idLte: {
						_id: "id3",
					},
				},
			});

			if (results.length !== 2)
				throw new Error("$idGte/$idLte: expected 2 results");
		},
	},
	{
		domain: "search-operators",
		name: "iEndsWith-operator",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					name: "David",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Bob",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "DAVID",
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$iEndsWith: {
						name: "id",
					},
				},
			});
			if (results.length !== 2)
				throw new Error(
					"$iEndsWith: expected 2 results, got: " + results.length,
				);
		},
	},
	{
		domain: "search-operators",
		name: "not-with-operator-gt",
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
			const results = await db.find<any>({
				collection: "items",
				search: {
					$not: {
						$gt: {
							val: 7,
						},
					},
				},
			});
			if (results.length !== 1)
				throw new Error(
					"$not with $gt: expected 1 result, got: " + results.length,
				);
			if (results[0].val !== 5)
				throw new Error("$not with $gt: wrong document");
		},
	},
	{
		domain: "search-operators",
		name: "not-with-exists",
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
							extra: true,
						},
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$not with $exists: expected 1 result");
			if (results[0].name !== "B")
				throw new Error("$not with $exists: wrong document");
		},
	},
	{
		domain: "search-operators",
		name: "not-with-in",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					status: "a",
				},
			});
			await db.add({
				collection: "items",
				data: {
					status: "b",
				},
			});
			await db.add({
				collection: "items",
				data: {
					status: "c",
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$not: {
						$in: {
							status: [
								"a",
								"c",
							],
						},
					},
				},
			});
			if (results.length !== 1)
				throw new Error("$not with $in: expected 1 result");
			if (results[0].status !== "b")
				throw new Error("$not with $in: wrong document");
		},
	},
	{
		domain: "search-operators",
		name: "not-with-regex",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					name: "John",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Jane",
				},
			});
			await db.add({
				collection: "items",
				data: {
					name: "Bob",
				},
			});
			const results = await db.find({
				collection: "items",
				search: {
					$not: {
						$regex: {
							name: /Jo/,
						},
					},
				},
			});
			if (results.length !== 2)
				throw new Error("$not with $regex: expected 2 results");
		},
	},
];
