import { ValtheraClass } from "@wxn0brp/db-core";
import type { TestDefinition } from "../types";

export const transactionTests: TestDefinition[] = [
	{
		domain: "transaction",
		name: "tx-commit-add",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.add({
						collection: "items",
						data: {
							_id: "tx-add-1",
							val: "committed",
						},
					});
				},
			);
			const result = await db.findOne<any>({
				collection: "items",
				search: {
					_id: "tx-add-1",
				},
			});
			if (!result || result.val !== "committed")
				throw new Error("Transaction commit failed: add not persisted");
		},
	},
	{
		domain: "transaction",
		name: "tx-commit-update",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "tx-update-1",
					val: "original",
				},
			});
			await db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.updateOne({
						collection: "items",
						search: {
							_id: "tx-update-1",
						},
						updater: {
							val: "updated",
						},
					});
				},
			);
			const result = await db.findOne<any>({
				collection: "items",
				search: {
					_id: "tx-update-1",
				},
			});
			if (!result || result.val !== "updated")
				throw new Error("Transaction commit failed: update not persisted");
		},
	},
	{
		domain: "transaction",
		name: "tx-commit-remove",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "tx-remove-1",
					val: "to-remove",
				},
			});
			await db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.removeOne({
						collection: "items",
						search: {
							_id: "tx-remove-1",
						},
					});
				},
			);
			const result = await db.findOne({
				collection: "items",
				search: {
					_id: "tx-remove-1",
				},
			});
			if (result)
				throw new Error("Transaction commit failed: remove not persisted");
		},
	},
	{
		domain: "transaction",
		name: "tx-rollback-add",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");

			try {
				await db.transaction(
					[
						"items",
					],
					async tx => {
						await tx.add({
							collection: "items",
							data: {
								_id: "tx-rollback-add-1",
								val: "should-not-persist",
							},
						});
						throw new Error("Trigger rollback");
					},
				);
			} catch (err: any) {
				if (err?.message !== "Trigger rollback") throw err;
			}
			const result = await db.findOne({
				collection: "items",
				search: {
					_id: "tx-rollback-add-1",
				},
			});
			if (result)
				throw new Error("Transaction rollback failed: add was persisted");
		},
	},
	{
		domain: "transaction",
		name: "tx-rollback-update",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "tx-rollback-update-1",
					val: "original",
				},
			});
			try {
				await db.transaction(
					[
						"items",
					],
					async tx => {
						await tx.updateOne({
							collection: "items",
							search: {
								_id: "tx-rollback-update-1",
							},
							updater: {
								val: "modified",
							},
						});
						throw new Error("Trigger rollback");
					},
				);
			} catch (err: any) {
				if (err?.message !== "Trigger rollback") throw err;
			}
			const result = await db.findOne<any>({
				collection: "items",
				search: {
					_id: "tx-rollback-update-1",
				},
			});
			if (!result || result.val !== "original")
				throw new Error("Transaction rollback failed: update was persisted");
		},
	},
	{
		domain: "transaction",
		name: "tx-rollback-remove",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "tx-rollback-remove-1",
					val: "should-survive",
				},
			});
			try {
				await db.transaction(
					[
						"items",
					],
					async tx => {
						await tx.removeOne({
							collection: "items",
							search: {
								_id: "tx-rollback-remove-1",
							},
						});
						throw new Error("Trigger rollback");
					},
				);
			} catch (err: any) {
				if (err?.message !== "Trigger rollback") throw err;
			}
			const result = await db.findOne<any>({
				collection: "items",
				search: {
					_id: "tx-rollback-remove-1",
				},
			});
			if (!result || result.val !== "should-survive")
				throw new Error("Transaction rollback failed: remove was persisted");
		},
	},
	{
		domain: "transaction",
		name: "tx-read-your-writes",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.add({
						collection: "items",
						data: {
							_id: "tx-rw-1",
							val: "visible-in-tx",
						},
					});
					const result = await tx.findOne<any>({
						collection: "items",
						search: {
							_id: "tx-rw-1",
						},
					});
					if (!result || result.val !== "visible-in-tx")
						throw new Error("Transaction cannot read its own writes");
				},
			);
		},
	},
	{
		domain: "transaction",
		name: "tx-multi-collection",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.add({
						collection: "items",
						data: {
							_id: "multi-1",
							type: "user",
							name: "User1",
						},
					});
					await tx.add({
						collection: "items",
						data: {
							_id: "multi-2",
							type: "post",
							title: "Post1",
						},
					});
				},
			);
			const all = await db.find<any>({
				collection: "items",
				search: {
					$or: [
						{
							_id: "multi-1",
						},
						{
							_id: "multi-2",
						},
					],
				},
			});
			if (all.length !== 2)
				throw new Error("Multi-operation transaction failed");
		},
	},
	{
		domain: "transaction",
		name: "tx-return-value",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			const result = await db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.add({
						collection: "items",
						data: {
							_id: "tx-return-1",
							val: 42,
						},
					});
					return "success";
				},
			);
			if (result !== "success")
				throw new Error("Transaction did not return value from fn");
		},
	},
	{
		domain: "transaction",
		name: "tx-updateOneOrAdd",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.transaction(
				[
					"items",
				],
				async tx => {
					const result1 = await tx.updateOneOrAdd<any>({
						collection: "items",
						search: {
							_id: "tx-upsert-1",
						},
						updater: {
							val: 100,
						},
						add_arg: {
							_id: "tx-upsert-1",
							val: 100,
						},
					});
					if (result1.type !== "added")
						throw new Error("updateOneOrAdd should add new document");
					const result2 = await tx.updateOneOrAdd<any>({
						collection: "items",
						search: {
							_id: "tx-upsert-1",
						},
						updater: {
							val: 200,
						},
					});
					if (result2.type !== "updated")
						throw new Error("updateOneOrAdd should update existing document");
					if (result2.data.val !== 200)
						throw new Error("updateOneOrAdd value mismatch");
				},
			);
			const final = await db.findOne<any>({
				collection: "items",
				search: {
					_id: "tx-upsert-1",
				},
			});
			if (!final || final.val !== 200)
				throw new Error("updateOneOrAdd transaction not persisted");
		},
	},
	{
		domain: "transaction",
		name: "tx-toggleOne",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.transaction(
				[
					"items",
				],
				async tx => {
					const result1 = await tx.toggleOne<any>({
						collection: "items",
						search: {
							_id: "tx-toggle-1",
						},
						data: {
							val: "toggled",
						},
					});
					if (result1.type !== "added")
						throw new Error("toggleOne should add new document");
					const result2 = await tx.toggleOne<any>({
						collection: "items",
						search: {
							_id: "tx-toggle-1",
						},
						data: {},
					});
					if (result2.type !== "removed")
						throw new Error("toggleOne should remove existing document");
				},
			);
			const final = await db.findOne({
				collection: "items",
				search: {
					_id: "tx-toggle-1",
				},
			});
			if (final) throw new Error("toggleOne transaction not persisted");
		},
	},
	{
		domain: "transaction",
		name: "tx-collection-mgmt",
		fn: async (db: ValtheraClass) => {
			await db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.ensureCollection("items");
					const exists = await tx.issetCollection("items");
					if (!exists) throw new Error("issetCollection failed in transaction");
				},
			);
			const exists = await db.issetCollection("items");
			if (!exists)
				throw new Error("Collection not persisted after transaction");
		},
	},
	{
		domain: "transaction",
		name: "tx-error-recovery",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			try {
				await db.transaction(
					[
						"items",
					],
					async tx => {
						await tx.add({
							collection: "items",
							data: {
								_id: "tx-recovery-1",
								val: "failed",
							},
						});
						throw new Error("Trigger rollback");
					},
				);
			} catch (err: any) {
				if (err?.message !== "Trigger rollback") throw err;
			}
			await db.add({
				collection: "items",
				data: {
					_id: "tx-recovery-2",
					val: "after-recovery",
				},
			});
			const result = await db.findOne<any>({
				collection: "items",
				search: {
					_id: "tx-recovery-2",
				},
			});
			if (!result || result.val !== "after-recovery")
				throw new Error("Adapter failed to recover after transaction error");
			const failed = await db.findOne({
				collection: "items",
				search: {
					_id: "tx-recovery-1",
				},
			});
			if (failed) throw new Error("Rolled back data should not exist");
		},
	},
	{
		domain: "transaction",
		name: "tx-c-api",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.c("items").add({
						_id: "tx-c-api-1",
						val: "via-c-api",
					});
				},
			);
			const result = await db.findOne<any>({
				collection: "items",
				search: {
					_id: "tx-c-api-1",
				},
			});
			if (!result || result.val !== "via-c-api")
				throw new Error("tx.c() API failed in transaction");
		},
	},
	{
		domain: "transaction",
		name: "tx-mixed-operations",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "mixed-1",
					val: "original",
				},
			});
			await db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.add({
						collection: "items",
						data: {
							_id: "mixed-2",
							val: "added",
						},
					});
					await tx.updateOne({
						collection: "items",
						search: {
							_id: "mixed-1",
						},
						updater: {
							val: "updated",
						},
					});
					await tx.add({
						collection: "items",
						data: {
							_id: "mixed-3",
							val: "to-remove",
						},
					});
					await tx.removeOne({
						collection: "items",
						search: {
							_id: "mixed-3",
						},
					});
				},
			);
			const all = await db.find<any>({
				collection: "items",
				search: {
					$or: [
						{
							_id: "mixed-1",
						},
						{
							_id: "mixed-2",
						},
						{
							_id: "mixed-3",
						},
					],
				},
			});
			if (all.length !== 2)
				throw new Error("Mixed operations: expected 2 documents");
			const updated = all.find((d: any) => d._id === "mixed-1");
			const added = all.find((d: any) => d._id === "mixed-2");
			if (!updated || updated.val !== "updated")
				throw new Error("Mixed operations: update failed");
			if (!added || added.val !== "added")
				throw new Error("Mixed operations: add failed");
		},
	},
	{
		domain: "transaction",
		name: "tx-mixed-operations-rollback",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "mixed-rb-1",
					val: "original",
				},
			});
			try {
				await db.transaction(
					[
						"items",
					],
					async tx => {
						await tx.add({
							collection: "items",
							data: {
								_id: "mixed-rb-2",
								val: "added",
							},
						});
						await tx.updateOne({
							collection: "items",
							search: {
								_id: "mixed-rb-1",
							},
							updater: {
								val: "updated",
							},
						});
						await tx.add({
							collection: "items",
							data: {
								_id: "mixed-rb-3",
								val: "to-remove",
							},
						});
						await tx.removeOne({
							collection: "items",
							search: {
								_id: "mixed-rb-3",
							},
						});
						throw new Error("Trigger rollback");
					},
				);
			} catch (err: any) {
				if (err?.message !== "Trigger rollback") throw err;
			}
			const all = await db.find<any>({
				collection: "items",
				search: {
					$or: [
						{
							_id: "mixed-rb-1",
						},
						{
							_id: "mixed-rb-2",
						},
						{
							_id: "mixed-rb-3",
						},
					],
				},
			});
			if (all.length !== 1)
				throw new Error("Mixed operations rollback: expected 1 document");
			if (all[0].val !== "original")
				throw new Error("Mixed operations rollback: original data modified");
		},
	},
	{
		domain: "transaction",
		name: "tx-isolation-blocking",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.add({
				collection: "items",
				data: {
					_id: "iso-1",
					val: "original",
				},
			});
			let outsideOpCompleted = false;
			let outsideOpStarted = false;
			const txPromise = db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.add({
						collection: "items",
						data: {
							_id: "iso-2",
							val: "in-tx",
						},
					});
					await new Promise(resolve => setTimeout(resolve, 50));
					if (outsideOpCompleted) {
						throw new Error(
							"Outside operation should be blocked during transaction",
						);
					}
				},
			);
			const outsidePromise = (async () => {
				outsideOpStarted = true;
				await db.add({
					collection: "items",
					data: {
						_id: "iso-3",
						val: "outside",
					},
				});
				outsideOpCompleted = true;
			})();
			await new Promise(resolve => setTimeout(resolve, 10));
			if (!outsideOpStarted) {
				throw new Error("Outside operation should have started");
			}
			await txPromise;
			await outsidePromise;
			if (!outsideOpCompleted) {
				throw new Error("Outside operation should complete after transaction");
			}
			const all = await db.find({
				collection: "items",
			});
			if (all.length !== 3) {
				throw new Error(`Expected 3 documents, got ${all.length}`);
			}
		},
	},
	{
		domain: "transaction",
		name: "tx-isolation-after-commit",
		fn: async (db: ValtheraClass) => {
			await db.ensureCollection("items");
			await db.transaction(
				[
					"items",
				],
				async tx => {
					await tx.add({
						collection: "items",
						data: {
							_id: "iso-after-1",
							val: "in-tx",
						},
					});
				},
			);
			await db.add({
				collection: "items",
				data: {
					_id: "iso-after-2",
					val: "after-tx",
				},
			});
			const all = await db.find({
				collection: "items",
			});
			if (all.length !== 2) {
				throw new Error(
					`Expected 2 documents after transaction, got ${all.length}`,
				);
			}
		},
	},
];
