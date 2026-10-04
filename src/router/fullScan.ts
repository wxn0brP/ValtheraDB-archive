import type { VQuery } from "@wxn0brp/db-core/types/query";
import { logger } from "../logger";
import { Squirrel } from "../squirrel";

export async function fullScanReq(
	squirrel: Squirrel,
	data: VQuery,
	op: string,
) {
	const servers = [
		...squirrel.topology.servers.entries(),
	];
	servers.sort((a, b) => a[0].localeCompare(b[0]));

	const findResult = [];

	for (const [serverId, server] of servers) {
		const isUp = await squirrel.topology.isServerUp(server.host);
		if (!isUp) {
			logger.warn("FULLSCAN", "[V-SQR-07-01] Server down, skipping:", serverId);
			continue;
		}

		const client = squirrel.getClient(server.host);

		logger.debug(
			"FULLSCAN",
			"[V-SQR-07-02] Querying server:",
			serverId,
			"op:",
			op,
		);

		if (op.includes("One")) {
			const opResult = await client[op](data);
			if (opResult) {
				findResult.push(opResult);
				logger.debug(
					"FULLSCAN",
					"[V-SQR-07-03] Found result on server:",
					serverId,
				);
				break;
			}
		} else {
			const opResult = await client[op](data);
			if (Array.isArray(opResult)) {
				findResult.push(...opResult);
			} else {
				findResult.push(opResult);
			}
			logger.debug(
				"FULLSCAN",
				"[V-SQR-07-04] Found results on server:",
				serverId,
				"count:",
				Array.isArray(opResult) ? opResult.length : 1,
			);
		}
	}

	logger.debug(
		"FULLSCAN",
		"[V-SQR-07-05] Full scan completed, total results:",
		findResult.length,
	);

	const responseData =
		op === "find" ? findResult : findResult[0] ? findResult[0] : null;

	return responseData;
}

export async function fullScanCollectionOp(
	squirrel: Squirrel,
	data: VQuery,
	op: string,
) {
	const servers = [
		...squirrel.topology.servers.entries(),
	];
	servers.sort((a, b) => a[0].localeCompare(b[0]));
	const { collection } = data;

	logger.debug(
		"FULLSCAN",
		"[V-SQR-07-06] Full scan collection op:",
		op,
		"collection:",
		collection,
	);

	switch (op) {
		case "getCollections": {
			const allCollections = new Set<string>();
			for (const [serverId, server] of servers) {
				const isUp = await squirrel.topology.isServerUp(server.host);
				if (!isUp) {
					logger.warn(
						"FULLSCAN",
						"[V-SQR-07-07] Server down, skipping:",
						serverId,
					);
					continue;
				}
				const client = squirrel.getClient(server.host);
				const collections = await client.getCollections();
				for (const c of collections) {
					allCollections.add(c);
				}
			}
			return [
				...allCollections,
			];
		}

		case "ensureCollection": {
			for (const [serverId, server] of servers) {
				const isUp = await squirrel.topology.isServerUp(server.host);
				if (!isUp) {
					logger.warn(
						"FULLSCAN",
						"[V-SQR-07-08] Server down, skipping:",
						serverId,
					);
					continue;
				}
				const client = squirrel.getClient(server.host);
				await client.ensureCollection(collection);
			}
			return true;
		}

		case "removeCollection": {
			for (const [serverId, server] of servers) {
				const isUp = await squirrel.topology.isServerUp(server.host);
				if (!isUp) {
					logger.warn(
						"FULLSCAN",
						"[V-SQR-07-09] Server down, skipping:",
						serverId,
					);
					continue;
				}
				console.log("ok", server.host);
				const client = squirrel.getClient(server.host);
				await client.removeCollection(collection);
			}
			return true;
		}

		case "issetCollection": {
			for (const [serverId, server] of servers) {
				const isUp = await squirrel.topology.isServerUp(server.host);
				if (!isUp) {
					logger.warn(
						"FULLSCAN",
						"[V-SQR-07-10] Server down, skipping:",
						serverId,
					);
					continue;
				}
				const client = squirrel.getClient(server.host);
				const exists = await client.issetCollection(collection);
				if (exists) return true;
			}
			return false;
		}

		default:
			logger.error("FULLSCAN", "[V-SQR-07-11] Unknown collection op:", op);
			return null;
	}
}
