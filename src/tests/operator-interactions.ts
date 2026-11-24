import { ValtheraClass } from "@wxn0brp/db-core";
import type { TestDefinition } from "../types";

export const operatorInteractionsTests: TestDefinition[] = [
	{
		domain: "search-operators",
		name: "nested-and-or-combination",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "1",
					a: 1,
					b: 2,
					c: 3,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "2",
					a: 1,
					b: 5,
					c: 3,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "3",
					a: 2,
					b: 2,
					c: 4,
				},
			});

			const results = await db.find<any>({
				collection: "items",
				search: {
					$and: [
						{
							a: 1,
						},
						{
							$or: [
								{
									b: 2,
								},
								{
									c: 4,
								},
							],
						},
					],
				},
			});

			if (results.length !== 1) throw new Error("Nested $and/$or failed");
			if (results[0]._id !== "1")
				throw new Error("Wrong document matched in nested logic");
		},
	},
	{
		domain: "search-operators",
		name: "not-with-comparison-operators",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "1",
					val: 5,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "2",
					val: 10,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "3",
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

			if (results.length !== 1) throw new Error("$not with $gt failed");
			if (results[0]._id !== "1")
				throw new Error("Wrong document matched for $not $gt");
		},
	},
	{
		domain: "search-operators",
		name: "multiple-operators-same-field",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "1",
					val: 5,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "2",
					val: 10,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "3",
					val: 15,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "4",
					val: 20,
				},
			});

			const results = await db.find<any>({
				collection: "items",
				search: {
					$and: [
						{
							$gte: {
								val: 10,
							},
						},
						{
							$lte: {
								val: 15,
							},
						},
					],
				},
			});

			if (results.length !== 2)
				throw new Error("Multiple operators on same field failed");
		},
	},
	{
		domain: "search-operators",
		name: "exists-with-type-check",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "1",
					val: "text",
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "2",
					val: 10,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "3",
				},
			});

			const results = await db.find<any>({
				collection: "items",
				search: {
					$and: [
						{
							$exists: {
								val: true,
							},
						},
						{
							$type: {
								val: "string",
							},
						},
					],
				},
			});

			if (results.length !== 1)
				throw new Error("$exists + $type combination failed");
			if (results[0]._id !== "1") throw new Error("Wrong document matched");
		},
	},
	{
		domain: "search-operators",
		name: "in-with-regex",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "1",
					name: "John",
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "2",
					name: "Jane",
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "3",
					name: "Bob",
				},
			});

			const results = await db.find({
				collection: "items",
				search: {
					$and: [
						{
							$in: {
								name: [
									"John",
									"Jane",
									"Alice",
								],
							},
						},
						{
							$regex: {
								name: /^J/,
							},
						},
					],
				},
			});

			if (results.length !== 2)
				throw new Error("$in + $regex combination failed");
		},
	},
	{
		domain: "search-operators",
		name: "or-with-different-field-types",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "1",
					name: "John",
					age: 25,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "2",
					name: "Jane",
					age: 30,
				},
			});
			await db.add({
				collection: "items",
				data: {
					_id: "3",
					name: "Bob",
					age: 35,
				},
			});

			const results = await db.find({
				collection: "items",
				search: {
					$or: [
						{
							name: "John",
						},
						{
							$gt: {
								age: 30,
							},
						},
					],
				},
			});

			if (results.length !== 2)
				throw new Error("$or with different field types failed");
		},
	},
];
