import { describe, expect, test } from "bun:test";
import { useDbOp } from "../src/router/op";
import { squirrelTimeKey } from "../src/vars";
import { createMemoryCluster, createResponse } from "./helpers/memory-squirrel";

function emptyReq(op: string) {
	return {
		params: {
			op,
		},
		body: {},
	} as any;
}

describe("client compatibility", () => {
	test("1. getCollections and capabilities work without a query body", async () => {
		const cluster = createMemoryCluster([
			"a",
			"b",
		]);

		const collections = await useDbOp(
			cluster.squirrel,
			emptyReq("getCollections"),
			createResponse() as any,
			undefined as any,
			"getCollections",
		)!;
		expect(collections.err).toBe(false);
		expect(Array.isArray(collections.result)).toBe(true);

		const capabilities = await useDbOp(
			cluster.squirrel,
			emptyReq("capabilities"),
			createResponse() as any,
			undefined as any,
			"capabilities",
		);
		expect(capabilities.err).toBe(false);
		expect(typeof capabilities.result.persistent).toBe("boolean");
		expect(typeof capabilities.result.transactions).toBe("boolean");
		expect(typeof capabilities.result.indexes).toBe("boolean");
	});
});

describe("count compatibility", () => {
	test("1. full scan sums counts across all servers", async () => {
		const cluster = createMemoryCluster([
			"a",
			"b",
			"c",
		]);
		await cluster.servers.get("a").db.add({
			collection: "items",
			data: {
				_id: "0-1",
			},
		});
		await cluster.servers.get("b").db.add({
			collection: "items",
			data: {
				_id: "0-2",
			},
		});

		const res = await useDbOp(
			cluster.squirrel,
			emptyReq("count"),
			createResponse() as any,
			{
				collection: "items",
				search: {},
			},
			"count",
		);

		expect(res.err).toBe(false);
		expect(res.result).toBe(2);
	});

	test("2. replication count deduplicates replicas and returns a single number", async () => {
		const cluster = createMemoryCluster(
			[
				"a",
				"b",
				"c",
			],
			{
				replicationEnabled: true,
				replicationFactor: 3,
			},
		);
		const id = cluster.findIdForIndex(0);
		await cluster.servers.get("a").db.add({
			collection: "items",
			data: {
				_id: id,
				[squirrelTimeKey]: 100,
			},
		});
		await cluster.servers.get("b").db.add({
			collection: "items",
			data: {
				_id: id,
				[squirrelTimeKey]: 200,
			},
		});

		const res = await useDbOp(
			cluster.squirrel,
			emptyReq("count"),
			createResponse() as any,
			{
				collection: "items",
				search: {
					_id: id,
				},
			},
			"count",
		);

		expect(res.err).toBe(false);
		expect(res.result).toBe(1);
	});
});

describe("bulkAdd compatibility", () => {
	test("1. returns every inserted document with a generated _id", async () => {
		const cluster = createMemoryCluster([
			"a",
			"b",
			"c",
		]);

		const res = await useDbOp(
			cluster.squirrel,
			emptyReq("bulkAdd"),
			createResponse() as any,
			{
				collection: "items",
				datas: [
					{
						val: 1,
					},
					{
						val: 2,
					},
					{
						val: 3,
					},
				],
			} as any,
			"bulkAdd",
		);

		expect(res.err).toBe(false);
		expect(res.result).toHaveLength(3);
		for (const doc of res.result) expect(doc._id).toBeTruthy();

		expect(await cluster.allRows("items")).toHaveLength(3);
	});

	test("2. routes manual ids to their owner without broadcasting", async () => {
		const cluster = createMemoryCluster([
			"a",
			"b",
			"c",
		]);
		const idA = cluster.findIdForIndex(0);
		const idB = cluster.findIdForIndex(1);

		const res = await useDbOp(
			cluster.squirrel,
			emptyReq("bulkAdd"),
			createResponse() as any,
			{
				collection: "items",
				datas: [
					{
						_id: idA,
						val: "a",
					},
					{
						_id: idB,
						val: "b",
					},
				],
			} as any,
			"bulkAdd",
		);

		expect(res.err).toBe(false);
		expect(res.result).toHaveLength(2);
		expect(await cluster.allRows("items")).toHaveLength(2);

		const ownerA = cluster.squirrel.topology.servers.get("a");
		const ownerB = cluster.squirrel.topology.servers.get("b");
		expect(await cluster.serverRows(ownerA.id, "items")).toHaveLength(1);
		expect(await cluster.serverRows(ownerB.id, "items")).toHaveLength(1);
		expect(await cluster.serverRows("c", "items")).toHaveLength(0);
	});

	test("3. writes to every replica of the owning set when replication is on", async () => {
		const cluster = createMemoryCluster(
			[
				"a",
				"b",
				"c",
			],
			{
				replicationEnabled: true,
				replicationFactor: 3,
			},
		);
		const id = cluster.findIdForIndex(0);

		const res = await useDbOp(
			cluster.squirrel,
			emptyReq("bulkAdd"),
			createResponse() as any,
			{
				collection: "items",
				datas: [
					{
						_id: id,
						val: "replicated",
					},
				],
			} as any,
			"bulkAdd",
		);

		expect(res.err).toBe(false);
		expect(res.result).toHaveLength(1);
		expect(res.result[0][squirrelTimeKey]).toBeUndefined();
		expect(await cluster.allRows("items")).toHaveLength(3);
	});

	test("4. broadcasts id-less entries when id_gen is false", async () => {
		const cluster = createMemoryCluster([
			"a",
			"b",
			"c",
		]);

		const res = await useDbOp(
			cluster.squirrel,
			emptyReq("bulkAdd"),
			createResponse() as any,
			{
				collection: "items",
				id_gen: false,
				datas: [
					{
						val: "x",
					},
					{
						val: "y",
					},
				],
			} as any,
			"bulkAdd",
		);

		expect(res.err).toBe(false);
		expect(res.result).toHaveLength(2);
		for (const doc of res.result) expect(doc._id).toBeUndefined();
		expect(await cluster.serverRows("a", "items")).toHaveLength(2);
		expect(await cluster.serverRows("b", "items")).toHaveLength(2);
		expect(await cluster.serverRows("c", "items")).toHaveLength(2);
	});

	test("5. rejects a bulkAdd without a datas array", async () => {
		const cluster = createMemoryCluster([
			"a",
		]);

		expect(
			useDbOp(
				cluster.squirrel,
				emptyReq("bulkAdd"),
				createResponse() as any,
				{
					collection: "items",
				} as any,
				"bulkAdd",
			),
		).rejects.toThrow();
	});
});
