import { ValtheraRemote } from "@wxn0brp/db-client";
import type { ValtheraCompatible } from "@wxn0brp/db-core/types/valthera";
import { Router } from "@wxn0brp/falcon-frame";
import { logger } from "./logger";
import { registerGetData, welcomeBack } from "./router/getData";
import { registerLogs } from "./router/logs";
import { registerDbOp } from "./router/op";
import { TopologyManager } from "./topology";
import { AuthConfig, SquirrelConfig } from "./types";

export type SquirrelClientProvider = (
	host: string,
	authConfig: AuthConfig,
) => ValtheraCompatible;

export class Squirrel {
	topology = new TopologyManager(this);
	_ready = false;
	clients = new Map<string, ValtheraCompatible>();

	constructor(
		public app: Router,
		public authConfig: AuthConfig,
		public config: SquirrelConfig,
		public clientProvider: SquirrelClientProvider = (host, authConfig) =>
			new ValtheraRemote({
				...authConfig,
				url: host,
			}),
	) {
		this.setupRoutes();
	}

	getClient(host: string) {
		if (!this.clients.has(host)) {
			this.clients.set(host, this.clientProvider(host, this.authConfig));
		}
		return this.clients.get(host);
	}

	async init(seeds: string[]) {
		logger.info(
			"SYSTEM",
			"[V-SQR-09-02] Initializing Squirrel with seeds:",
			seeds.length,
		);
		await this.topology.init(seeds);
		logger.info(
			"SYSTEM",
			"[V-SQR-09-03] Squirrel initialized, servers:",
			this.topology.servers.size,
			"epochs:",
			this.topology.epochs.length,
		);

		if (this.config.replicationEnabled) {
			logger.info(
				"SYSTEM",
				"[V-SQR-09-04] Replication enabled. Factor:",
				this.config.replicationFactor,
			);
		}

		this._ready = true;

		if (this.config.autoSyncOnStartup) {
			await this.syncUpServers();
		}
	}

	async syncUpServers() {
		logger.info("SYNC", "[V-SQR-09-10] Starting auto-sync for up servers");
		for (const [serverId, server] of this.topology.servers) {
			const isUp = await this.topology.isServerUp(server.host);
			if (isUp) {
				logger.debug("SYNC", "[V-SQR-09-11] Server is up, syncing:", serverId);
				const result = await welcomeBack(this, serverId);
				if (result.err) {
					logger.warn(
						"SYNC",
						"[V-SQR-09-12] Sync failed for server:",
						serverId,
						result.msg,
					);
				} else {
					logger.debug(
						"SYNC",
						"[V-SQR-09-13] Sync completed for server:",
						serverId,
					);
				}
			} else {
				logger.debug(
					"SYNC",
					"[V-SQR-09-14] Server is down, skipping:",
					serverId,
				);
			}
		}
		logger.info("SYNC", "[V-SQR-09-15] Auto-sync completed");
	}

	setupRoutes() {
		this.app.use((req, res, next) => {
			if (!this._ready)
				return res.status(503).json({
					err: true,
					msg: "Squirrel not ready",
				});
			next();
		});

		registerLogs(this);

		this.app.use((req, res, next) => {
			const { auth, db } = req.body;
			const authHeader = req.headers.authorization;

			if (!db)
				return res.status(400).json({
					err: true,
					msg: "Missing db",
				});

			const authToken = auth || authHeader?.replace("Bearer ", "");

			if (!authToken)
				return res.status(401).json({
					err: true,
					msg: "Missing auth",
				});

			if (db !== this.authConfig.name)
				return res.status(400).json({
					err: true,
					msg: "Unauthorized",
				});

			if (authToken !== this.authConfig.auth)
				return res.status(401).json({
					err: true,
					msg: "Unauthorized",
				});

			next();
		});

		registerDbOp(this);
		registerGetData(this);
		logger.info("SYSTEM", "[V-SQR-09-01] Routes registered");
	}
}
