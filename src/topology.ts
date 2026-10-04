import { convertIdToUnix } from "@wxn0brp/db-core/utils/id";
import { logger } from "./logger";
import { Squirrel } from "./squirrel";
import {
	Epoch,
	ServerEpochInfo,
	ServerInfo,
	SquirrelConfigDbEntry,
} from "./types";
import { parseServerInfo } from "./utils";
import { COLLECTIONS, TIMEOUTS } from "./vars";

export class TopologyManager {
	epochs: Epoch[] = [];
	servers = new Map<string, ServerInfo>();

	constructor(public squirrel: Squirrel) {}

	async init(seeds: string[]) {
		if (seeds.length === 0) throw new Error("[V-SQR-01-01] No seeds provided");

		let failed = 0;
		for (const seed of seeds) {
			const server = parseServerInfo(seed);
			if (server.id) {
				logger.debug(
					"TOPOLOGY",
					"[V-SQR-01-02] Seed parsed, adding server:",
					server.id,
				);
				this.addServer(server);
			} else {
				logger.warn("TOPOLOGY", "[V-SQR-01-03] Invalid seed:", seed);
				failed++;
				continue;
			}

			logger.debug(
				"TOPOLOGY",
				"[V-SQR-01-04] Checking server availability:",
				seed,
			);
			const isUp = await this.isServerUp(server.host);
			if (!isUp) {
				logger.warn("TOPOLOGY", "[V-SQR-01-05] Server is down:", seed);
				failed++;
				continue;
			}
			logger.debug("TOPOLOGY", "[V-SQR-01-06] Server is up:", seed);
			await this._getConfig(server.host);
			logger.debug(
				"TOPOLOGY",
				"[V-SQR-01-07] Successfully fetched config from:",
				seed,
			);
		}

		if (failed === seeds.length)
			throw new Error("[V-SQR-01-10] No servers available");

		if (this.servers.size === 0)
			throw new Error("[V-SQR-01-11] No servers found");

		if (this.epochs.length) this.epochs.sort((a, b) => a.start - b.start);
		else {
			logger.info(
				"TOPOLOGY",
				"[V-SQR-01-12] New epoch required. No epochs found",
			);
			await this.initNewEpoch();
			logger.info(
				"TOPOLOGY",
				"[V-SQR-01-13] New epoch initialized. Servers:",
				this.epochs[this.epochs.length - 1].serverIds,
			);
		}

		const epochsServers = this.epochs[this.epochs.length - 1].serverIds;
		const allServers = [
			...this.servers.keys(),
		];
		const notChanged = allServers.every(s => epochsServers.includes(s));

		if (!notChanged) {
			logger.info(
				"TOPOLOGY",
				"[V-SQR-01-20] New epoch required. Servers list changed",
			);
			await this.initNewEpoch();
			logger.info(
				"TOPOLOGY",
				"[V-SQR-01-21] New epoch initialized. Servers:",
				this.epochs[this.epochs.length - 1].serverIds,
			);
		}
	}

	addServer(server: ServerInfo) {
		if (this.servers.has(server.id)) return;
		logger.debug(
			"TOPOLOGY",
			"[V-SQR-02-01] Adding server to topology:",
			server.id,
			server.host,
		);
		this.servers.set(server.id, server);
	}

	async _getConfig(url: string) {
		try {
			const client = this.squirrel.getClient(url);

			const config: SquirrelConfigDbEntry[] = await client.find({
				collection: COLLECTIONS.SQUIRREL,
				search: {},
			});

			if (config.length === 0) return;

			const servers = config.filter(d => d._id === "server");
			servers.forEach(d => {
				const info = parseServerInfo(d.v);
				if (!info.id) {
					logger.warn(
						"TOPOLOGY",
						"[V-SQR-17-02] Invalid server info. Missing id:",
						d.v,
					);
					return;
				}
				this.addServer(info);
			});

			const epochs = config.filter(d => d._id === "epoch");
			epochs.forEach(d => {
				const data = d.v.split(",");
				const start = +data.shift();
				if (this.epochs.find(e => e.start === start)) return;
				this.epochs.push({
					start,
					serverIds: data,
				});
			});
		} catch (e) {
			logger.warn(
				"TOPOLOGY",
				"[V-SQR-17-01] Failed to fetch config from:",
				url,
				e.message,
			);
		}
	}

	getServerForId(id: string): ServerEpochInfo {
		const epoch = this.getEpoch(convertIdToUnix(id));
		if (!epoch || epoch.serverIds.length === 0) {
			logger.warn(
				"TOPOLOGY",
				"[V-SQR-03-01] No epoch or empty serverIds for id:",
				id,
			);
			return null;
		}

		const idx = this._hash(id) % epoch.serverIds.length;
		const targetId = epoch.serverIds[idx];
		logger.debug(
			"TOPOLOGY",
			"[V-SQR-03-02] Resolving server for id:",
			id,
			"hash:",
			idx,
			"target:",
			targetId,
		);
		const server = this.servers.get(targetId);
		if (!server) {
			logger.error(
				"TOPOLOGY",
				"[V-SQR-03-03] Server not found for id:",
				id,
				"target:",
				targetId,
			);
			return null;
		}

		return {
			server,
			epoch,
			idx,
		};
	}

	async getCatchupServer(excludedId: string, epoch: Epoch) {
		logger.debug(
			"TOPOLOGY",
			"[V-SQR-04-01] Searching for catchup server, excluding:",
			excludedId,
		);
		const excludedIdx = epoch.serverIds.indexOf(excludedId);
		const startIdx =
			excludedIdx >= 0
				? excludedIdx
				: this._hash(excludedId) % epoch.serverIds.length;

		for (let i = 1; i < epoch.serverIds.length; i++) {
			const idx = (startIdx + i) % epoch.serverIds.length;
			const catchupId = epoch.serverIds[idx];
			if (catchupId !== excludedId) {
				const catchup = this.servers.get(catchupId);
				if (!catchup) {
					logger.warn(
						"TOPOLOGY",
						"[V-SQR-04-02] Catchup server missing from topology:",
						catchupId,
					);
					continue;
				}
				logger.debug(
					"TOPOLOGY",
					"[V-SQR-04-03] Checking catchup candidate:",
					catchupId,
				);
				const isUp = await this.isServerUp(catchup.host);
				if (isUp) {
					logger.debug(
						"TOPOLOGY",
						"[V-SQR-04-04] Found catchup server:",
						catchupId,
					);
					return catchup;
				}
			}
		}
		logger.warn(
			"TOPOLOGY",
			"[V-SQR-04-05] No catchup server found for excluded:",
			excludedId,
		);
		return null;
	}

	async isServerUp(host: string) {
		try {
			const res = await fetch(host, {
				method: "GET",
				signal: AbortSignal.timeout(TIMEOUTS.SERVER_CHECK),
			});
			return !!res.status;
		} catch {
			return false;
		}
	}

	getEpoch(timestamp: number) {
		for (let i = this.epochs.length - 1; i >= 0; i--) {
			const e = this.epochs[i];
			const next = this.epochs[i + 1];
			if (e.start <= timestamp && (!next || next.start > timestamp)) return e;
		}
		return null;
	}

	_hash(key: string) {
		let h = 2166136261;
		for (let i = 0; i < key.length; i++) {
			h ^= key.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		return h >>> 0;
	}

	async initNewEpoch() {
		const now = Date.now();
		logger.info("TOPOLOGY", "[V-SQR-05-01] Creating new epoch at:", now);

		const servers = [
			...this.servers.keys(),
		];
		if (servers.length === 0) throw new Error("[V-SQR-05-02] No servers found");
		servers.sort((a, b) => a.localeCompare(b));
		logger.info("TOPOLOGY", "[V-SQR-05-03] Servers in new epoch:", servers);

		const newEpoch: Epoch = {
			start: now,
			serverIds: servers,
		};
		this.epochs.push(newEpoch);

		let failed = 0;
		for (const server of servers) {
			const host = this.servers.get(server).host;
			const client = this.squirrel.getClient(host);
			try {
				await client.add({
					collection: COLLECTIONS.SQUIRREL,
					data: {
						_id: "epoch",
						v: newEpoch.start + "," + newEpoch.serverIds.join(","),
					},
				});
				logger.debug(
					"TOPOLOGY",
					"[V-SQR-05-04] Epoch added to server:",
					server,
				);
			} catch (e) {
				logger.error("TOPOLOGY", e);
				logger.error(
					"TOPOLOGY",
					"[V-SQR-05-05] Failed to add epoch to server:",
					server,
				);
				failed++;
			}
		}
		if (failed === servers.length)
			return logger.error(
				"TOPOLOGY",
				"[V-SQR-05-06] Failed to add epoch to all servers",
			);
		logger.info(
			"TOPOLOGY",
			"[V-SQR-05-07] Epoch created successfully:",
			newEpoch.start,
			"servers:",
			newEpoch.serverIds.length,
		);
	}
}
