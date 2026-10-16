import { createMemoryValthera } from "@wxn0brp/db-core";
import type { ValtheraCompatible } from "@wxn0brp/db-core/types/valthera";
import { TopologyManager } from "../../src/topology";
import { ServerInfo, SquirrelConfig } from "../../src/types";

export interface MemoryServer {
	id: string;
	host: string;
	db: ValtheraCompatible;
	up: boolean;
	faults: Map<string, MemoryFault>;
	latencies: Map<string, number>;
}

export interface MemoryFault {
	error: Error;
	remaining: number;
}

export interface MemoryCluster {
	squirrel: any;
	servers: Map<string, MemoryServer>;
	setUp: (id: string, up: boolean) => void;
	failOp: (
		id: string,
		op: string,
		error?: Error | string,
		count?: number,
	) => void;
	failOnce: (id: string, op: string, error?: Error | string) => void;
	clearFault: (id: string, op: string) => void;
	setLatency: (id: string, op: string, ms: number) => void;
	serverRows: (id: string, collection: string) => Promise<any[]>;
	catchupRows: (to?: string) => Promise<any[]>;
	allRows: (collection: string) => Promise<any[]>;
	findIdForIndex: (idx: number) => string;
}

export function createMemoryCluster(
	ids: string[],
	config: Partial<SquirrelConfig> = {},
): MemoryCluster {
	const servers = new Map<string, MemoryServer>();

	for (const id of ids) {
		servers.set(id, {
			id,
			host: `http://${id}.local/`,
			db: createMemoryValthera(),
			up: true,
			faults: new Map(),
			latencies: new Map(),
		});
	}

	const squirrel: any = {
		authConfig: {
			name: "db",
			auth: "auth",
		},
		config: {
			allowCatchupServer: true,
			allowFullScan: true,
			replicationEnabled: false,
			replicationFactor: 3,
			autoSyncOnStartup: false,
			...config,
		},
		clients: new Map<string, ValtheraCompatible>(),
		getClient(host: string) {
			if (!this.clients.has(host)) {
				const server = [
					...servers.values(),
				].find(s => s.host === host);
				if (!server) throw new Error(`Unknown host ${host}`);
				this.clients.set(host, createGuardedClient(server));
			}
			return this.clients.get(host);
		},
	};

	const topology = new TopologyManager(squirrel);
	topology.epochs = [
		{
			start: 0,
			serverIds: ids,
		},
	];
	topology.servers = new Map<string, ServerInfo>(
		ids.map(id => {
			const server = servers.get(id);
			return [
				id,
				{
					id,
					host: server.host,
				},
			];
		}),
	);
	topology.isServerUp = async (host: string) => {
		const server = [
			...servers.values(),
		].find(s => s.host === host);
		return !!server?.up;
	};
	squirrel.topology = topology;

	return {
		squirrel,
		servers,
		setUp(id: string, up: boolean) {
			servers.get(id).up = up;
		},
		failOp(
			id: string,
			op: string,
			error: Error | string = `Forced ${op} failure on ${id}`,
			count = Infinity,
		) {
			servers.get(id).faults.set(op, {
				error: typeof error === "string" ? new Error(error) : error,
				remaining: count,
			});
		},
		failOnce(
			id: string,
			op: string,
			error: Error | string = `Forced ${op} failure on ${id}`,
		) {
			this.failOp(id, op, error, 1);
		},
		clearFault(id: string, op: string) {
			servers.get(id).faults.delete(op);
		},
		setLatency(id: string, op: string, ms: number) {
			servers.get(id).latencies.set(op, ms);
		},
		serverRows(id: string, collection: string) {
			return findAll(servers.get(id), collection);
		},
		async catchupRows(to?: string) {
			const rows = await this.allRows("__squirrel_catchup");
			return to ? rows.filter(row => row.to === to) : rows;
		},
		async allRows(collection: string) {
			const rows = [];
			for (const server of servers.values())
				rows.push(...(await findAll(server, collection)));
			return rows;
		},
		findIdForIndex(idx: number) {
			for (let i = 0; i < 10_000; i++) {
				const id = `0-${i}`;
				if (topology.getServerForId(id)?.idx === idx) return id;
			}
			throw new Error(`No id found for index ${idx}`);
		},
	};
}

export function createResponse() {
	return {
		statusCode: 200,
		body: undefined as any,
		redirectUrl: undefined as string | undefined,
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		json(body: any) {
			this.body = body;
			return body;
		},
		redirect(url: string, code: number) {
			this.redirectUrl = url;
			this.statusCode = code;
		},
	};
}

export async function findAll(server: MemoryServer, collection: string) {
	return server.db.find({
		collection,
		search: {},
	});
}

function createGuardedClient(server: MemoryServer): ValtheraCompatible {
	return new Proxy(server.db, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver);
			if (typeof value !== "function") return value;

			return async (...args: any[]) => {
				if (!server.up) throw new Error(`Server ${server.id} is down`);
				const op = String(property);
				const fault = server.faults.get(op);
				if (fault) {
					if (fault.remaining !== Infinity) fault.remaining--;
					if (fault.remaining <= 0) server.faults.delete(op);
					throw fault.error;
				}
				const latency = server.latencies.get(op);
				if (latency) await Bun.sleep(latency);
				return value.apply(target, args);
			};
		},
	});
}
