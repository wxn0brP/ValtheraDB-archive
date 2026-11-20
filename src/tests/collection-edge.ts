import type { TestDefinition } from "../types";

export const collectionEdgeTests: TestDefinition[] = [
	{
		domain: "collection-api",
		name: "collection-recreated-after-removal-has-no-stale-data",
		fn: async db => {
			const first = db.c("items");
			await first.add({
				_id: "old",
			});
			await db.removeCollection("items");
			const second = db.c("items");
			await second.add({
				_id: "new",
			});
			const documents = await second.find();
			if (documents.length !== 1 || documents[0]._id !== "new")
				throw new Error("Recreated collection contains stale data");
		},
	},
	{
		domain: "collection-api",
		name: "collection-bulk-count-toggle-and-find-options",
		fn: async db => {
			const collection = db.c("items");
			await collection.bulkAdd([
				{
					_id: "a",
					value: 1,
				},
				{
					_id: "b",
					value: 2,
				},
				{
					_id: "c",
					value: 3,
				},
			]);
			if (
				(await collection.count({
					$gt: {
						value: 1,
					},
				})) !== 2
			)
				throw new Error("Collection count must forward search operators");
			const rows = await collection.find(
				{},
				{
					sortBy: "value",
					sortAsc: false,
					offset: 1,
					limit: 1,
				},
				{
					select: [
						"value",
					],
				},
			);
			if (JSON.stringify(rows) !== '[{"value":2}]')
				throw new Error(
					"Collection must forward database and projection options",
				);
			const removed = await collection.toggleOne({
				_id: "a",
			});
			const added = await collection.toggleOne(
				{
					_id: "a",
				},
				{
					value: 9,
				},
			);
			if (
				removed.type !== "removed" ||
				added.type !== "added" ||
				(
					await collection.findOne({
						_id: "a",
					})
				).value !== 9 ||
				(await collection.count()) !== 3
			)
				throw new Error(
					"Collection toggle must remove and recreate a document",
				);
		},
	},
	{
		domain: "collection-management",
		name: "removeCollection-missing-is-idempotent",
		fn: async db => {
			await db.removeCollection("missing");
			await db.removeCollection("missing");
			if (await db.issetCollection("missing"))
				throw new Error("Removing a missing collection must leave it absent");
		},
	},
];
