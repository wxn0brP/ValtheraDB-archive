import { genId } from "@wxn0brp/db-core";
import { QueryValidationError } from "@wxn0brp/db-core/errors";
import type { Data } from "@wxn0brp/db-core/types/data";
import type { VQueryT } from "@wxn0brp/db-core/types/query";
import { logger } from "../logger";
import { useCatchupServerLogic } from "../router/catchup";
import { Squirrel } from "../squirrel";
import { Epoch, ServerInfo } from "../types";
import { squirrelTimeKey } from "../vars";
import { getReplicaServers } from "./utils";

/**
 * Routes every entry of a bulkAdd to the server (or replica set) owning its `_id`.
 * Entries without an `_id` (only when `id_gen: false`) are broadcast to all servers.
 */
export async function bulkAddOp(
	squirrel: Squirrel,
	query: VQueryT.BulkAdd,
): Promise<Data[]> {
	if (!Array.isArray(query?.datas))
		throw new QueryValidationError("bulkAdd requires a datas array", {
			collection: query?.collection,
		});

	const { collection, datas } = query;
	if (!datas.length) return [];

	const replicationEnabled = squirrel.config.replicationEnabled;
	const epoch = squirrel.topology.getEpoch(Date.now());

	const results: Data[] = [];

	for (const raw of datas) {
		const item = raw as Data;
		if (!item._id && query.id_gen !== false) item._id = genId();

		const stored = replicationEnabled
			? {
					...item,
					[squirrelTimeKey]: Date.now(),
				}
			: item;

		const targets = resolveTargets(squirrel, item._id);
		if (!targets.length) {
			logger.warn(
				"BULKADD",
				"[V-SQR-18-01] No target server for item in",
				collection,
				item._id,
			);
			continue;
		}

		const written = await writeItem(
			squirrel,
			collection,
			stored,
			targets,
			epoch,
		);
		if (!written) continue;

		if (replicationEnabled) delete (stored as any)[squirrelTimeKey];
		results.push(stored);
	}

	return results;
}

function resolveTargets(squirrel: Squirrel, id?: string): ServerInfo[] {
	if (id) {
		if (squirrel.config.replicationEnabled)
			return getReplicaServers(squirrel, id);
		const target = squirrel.topology.getServerForId(id);
		return target
			? [
					target.server,
				]
			: [];
	}
	return [
		...squirrel.topology.servers.values(),
	];
}

async function writeItem(
	squirrel: Squirrel,
	collection: string,
	item: Data,
	targets: ServerInfo[],
	epoch: Epoch,
): Promise<boolean> {
	let written = false;

	for (const server of targets) {
		try {
			await squirrel.getClient(server.host).add({
				collection,
				data: item,
				id_gen: false,
			});
			written = true;
		} catch (e) {
			logger.error(
				"BULKADD",
				"[V-SQR-18-02] Failed to write to",
				server.id,
				":",
				(e as any)?.message ?? e,
			);
			if (!squirrel.config.allowCatchupServer || !epoch) continue;

			const result = await useCatchupServerLogic(
				squirrel,
				{
					collection,
					data: item,
					id_gen: false,
				},
				"add",
				server.id,
				epoch,
			);
			if (!("err" in result)) written = true;
			else
				logger.warn(
					"BULKADD",
					"[V-SQR-18-03] Catchup failed for",
					server.id,
					":",
					result.msg,
				);
		}
	}

	return written;
}
