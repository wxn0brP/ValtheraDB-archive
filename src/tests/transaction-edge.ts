import type { TestDefinition } from "../types";
import { isQueryValidationFailure } from "./query-error";

export const transactionEdgeTests: TestDefinition[] = [
	{
		domain: "transaction",
		name: "tx-bulk-add-count-commit",
		fn: async db => {
			await db.ensureCollection("items");
			const count = await db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.c("items").bulkAdd([
						{
							value: 1,
						},
						{
							value: 2,
						},
						{
							value: 3,
						},
					]);
					return tx.c("items").count({
						$gt: {
							value: 1,
						},
					});
				},
			);
			if (count !== 2 || (await db.c("items").count()) !== 3)
				throw new Error(
					"Transaction bulkAdd/count must see and commit all rows",
				);
		},
	},
	{
		domain: "transaction",
		name: "tx-operator-error-rolls-back-and-releases-locks",
		fn: async db => {
			await db.c("items").add({
				_id: "original",
				value: "text",
			});
			let caught: unknown;
			try {
				await db.transaction(
					[
						"items",
					],
					async tx => {
						await tx.c("items").bulkAdd([
							{
								_id: "new-a",
							},
							{
								_id: "new-b",
							},
						]);
						await tx.c("items").updateOne(
							{
								_id: "original",
							},
							{
								$inc: {
									value: 1,
								},
							},
						);
					},
				);
			} catch (error) {
				caught = error;
			}
			if (!isQueryValidationFailure(caught))
				throw new Error(
					"Transaction must preserve the operator validation error",
				);
			const rows = await db.c("items").find();
			if (
				rows.length !== 1 ||
				rows[0]._id !== "original" ||
				rows[0].value !== "text"
			)
				throw new Error("Operator failure must roll back earlier bulk writes");
			await db.c("items").add({
				_id: "after",
			});
			if ((await db.c("items").count()) !== 2)
				throw new Error("Operations must resume after rollback");
		},
	},
	{
		domain: "transaction",
		name: "tx-preserves-original-callback-error",
		fn: async db => {
			await db.ensureCollection("items");
			const expected = new Error("intentional rollback");
			let caught: unknown;
			try {
				await db.transaction(
					[
						"items",
					],
					async tx => {
						await tx.c("items").add({
							_id: "rolled-back",
						});
						throw expected;
					},
				);
			} catch (error) {
				caught = error;
			}
			if (caught !== expected || (await db.c("items").count()) !== 0)
				throw new Error(
					"Successful rollback must rethrow the same callback error",
				);
			await db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.c("items").add({
						_id: "committed",
					});
				},
			);
			if ((await db.c("items").count()) !== 1)
				throw new Error("A later transaction must acquire the released locks");
		},
	},
];
