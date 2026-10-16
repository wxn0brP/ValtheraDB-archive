import { Data } from "@wxn0brp/db-core/types/data";
import { VQuery } from "@wxn0brp/db-core/types/query";
import { logger } from "../logger";
import { useCatchupServerLogic } from "../router/catchup";
import { Squirrel } from "../squirrel";
import { ServerInfo } from "../types";
import { squirrelTimeKey } from "../vars";
import { getReplicaServers } from "./utils";
import { genId } from "@wxn0brp/db-core";

export async function replicationOther(
	squirrel: Squirrel,
	op: string,
	id: string,
	data: VQuery<Data, false>,
): Promise<any> {
	logger.debug(
		"REPLICATION",
		"[V-SQR-13-01] replicationOther, op:",
		op,
		"id:",
		id,
	);

	let servers: ServerInfo[] = [];
	if (id) {
		servers = getReplicaServers(squirrel, id);
		logger.debug(
			"REPLICATION",
			"[V-SQR-13-02] replicas count:",
			servers.length,
		);
		if (!servers.length) return [];
	} else {
		servers = [
			...squirrel.topology.servers.values(),
		];
		logger.debug("REPLICATION", "[V-SQR-13-03] total servers:", servers.length);
	}

	if (!servers.length) return [];

	if (data.updater) data.updater[squirrelTimeKey] = Date.now();
	if (data.data) data.data[squirrelTimeKey] = Date.now();
	logger.debug(
		"REPLICATION",
		"[V-SQR-13-04] added",
		squirrelTimeKey,
		"to data/updater",
	);

	if (data.data && !data.data._id) {
		const id = genId();
		logger.warn(
			"REPLICATION",
			"[V-SQR-13-05] no _id in data, generating one:",
			id,
		);
		data.data._id = id;
	}

	if (data.add_arg && data.updater && data.search) {
		if (!data.add_arg._id && !data.search._id && !data.updater._id) {
			const id = genId();
			logger.warn(
				"REPLICATION",
				"[V-SQR-13-06] no _id in add_arg/search/updater, generating one:",
				id,
			);
			data.add_arg._id = id;
		}
	}

	let responses: Data[] = [];
	const missing: ServerInfo[] = [];
	for (const server of servers) {
		try {
			const client = squirrel.getClient(server.host);
			logger.debug(
				"REPLICATION",
				"[V-SQR-13-10] calling",
				op,
				"on",
				server.host,
			);
			const res = await client[op](data);
			responses.push(res);
		} catch (e) {
			logger.error(
				"REPLICATION",
				"[V-SQR-13-11] error querying",
				server.host,
				":",
				e.message,
			);
			missing.push(server);
		}
	}
	responses = responses.flat();

	if (missing.length) {
		const epoch = squirrel.topology.getEpoch(Date.now());
		for (const miss of missing) {
			const result = await useCatchupServerLogic(
				squirrel,
				data,
				op,
				miss.id,
				epoch,
			);
			if ("err" in result)
				logger.warn(
					"REPLICATION",
					"[V-SQR-13-15] catchup failed for",
					miss.id,
					":",
					result.msg,
				);
		}
	}

	logger.debug(
		"REPLICATION",
		"[V-SQR-13-16] returning",
		responses.length,
		"responses",
	);

	if (!responses.length) return op.includes("One") ? undefined : [];

	if (op.includes("One") || op === "add") {
		if (responses[0]) delete responses[0][squirrelTimeKey];
		return responses[0];
	} else
		return responses.map(d => {
			if (d) delete d[squirrelTimeKey];
			return d;
		});
}
