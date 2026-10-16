import { isValtheraError } from "@wxn0brp/db-core/errors";
import type { VQuery } from "@wxn0brp/db-core/types/query";
import { FFRequest, FFResponse } from "@wxn0brp/falcon-frame";
import { logger } from "../logger";
import { bulkAddOp } from "../replication/bulkAdd";
import { replicationCount } from "../replication/count";
import { replicationFind, replicationFindOne } from "../replication/find";
import { replicationOther } from "../replication/other";
import { Squirrel } from "../squirrel";
import { COLLECTION_OPS, HTTP_STATUS, NO_QUERY_OPS } from "../vars";
import { useCatchupServer } from "./catchup";
import { fullScanCollectionOp, fullScanReq } from "./fullScan";

function getQuery(req: FFRequest): VQuery {
	return req.body.query || req.body.params?.[0];
}

export function registerDbOp(squirrel: Squirrel) {
	const createHandler =
		(op: (req: FFRequest) => string) =>
		async (req: FFRequest, res: FFResponse) => {
			try {
				return await useDbOp(squirrel, req, res, getQuery(req), op(req));
			} catch (err) {
				const body: Record<string, unknown> = {
					err: true,
					msg: (err as any)?.message ?? String(err),
				};
				if (isValtheraError(err)) {
					body.code = err.code;
					if (err.suggestion) body.suggestion = err.suggestion;
					if (err.context) body.context = err.context;
				}
				return res.status(500).json(body);
			}
		};

	const { app } = squirrel;

	app.post(
		"/db/:op",
		createHandler(req => req.params.op),
	);
	app.post(
		"/db/:db/:op",
		createHandler(req => req.params.op),
	);
	app.post(
		"/",
		createHandler(req => req.body.op),
	);
}

export async function useDbOp(
	squirrel: Squirrel,
	req: FFRequest,
	res: FFResponse,
	data: VQuery,
	op: string,
): Promise<any> {
	if (!op)
		return res.json({
			err: true,
			msg: "No op specified",
		});

	if (NO_QUERY_OPS.has(op)) {
		return {
			err: false,
			result: await fullScanCollectionOp(squirrel, data ?? {}, op),
		};
	}

	if (!data || typeof data !== "object" || Array.isArray(data))
		return res.json({
			err: true,
			msg: "VQuery is not an object",
		});

	if (typeof data.search === "function")
		return res.status(400).json({
			err: true,
			msg: "Search function is not supported",
		});

	if (op === "bulkAdd") {
		return {
			err: false,
			result: await bulkAddOp(squirrel, data as any),
		};
	}

	if (COLLECTION_OPS.has(op)) {
		const res = await fullScanCollectionOp(squirrel, data, op);
		return {
			err: false,
			result: res,
		};
	}

	const id = data.data?._id || data.search?._id;
	logger.debug("ROUTER", "[V-SQR-06-01] id:", id);

	if (squirrel.config.replicationEnabled) {
		switch (op) {
			case "findOne":
				return {
					err: false,
					result: await replicationFindOne(squirrel, id, data as any),
				};
			case "find":
				return {
					err: false,
					result: await replicationFind(squirrel, id, data as any),
				};
			case "count":
				return {
					err: false,
					result: await replicationCount(squirrel, id, data as any),
				};
			default:
				return {
					err: false,
					result: await replicationOther(squirrel, op, id, data as any),
				};
		}
	}

	if (!id) {
		logger.debug("ROUTER", "[V-SQR-06-02] No id in query, checking full scan");

		if (squirrel.config.allowFullScan) {
			logger.debug("ROUTER", "[V-SQR-06-03] Starting full scan");

			return {
				err: false,
				result: await fullScanReq(squirrel, data as any, op),
			};
		}
		logger.warn("ROUTER", "[V-SQR-06-04] Full scan not allowed");
		return res.status(400).json({
			err: true,
			msg: "Missing id",
		});
	}

	const target = squirrel.topology.getServerForId(id);
	if (!target) {
		logger.error("ROUTER", "[V-SQR-06-05] No server found for id:", id);
		return res.status(503).json({
			err: true,
			msg: "No server for epoch",
		});
	}

	logger.debug("ROUTER", "[V-SQR-06-06] target:", target);
	const isUp = await squirrel.topology.isServerUp(target.server.host);
	logger.debug("ROUTER", "[V-SQR-06-07] isUp:", isUp);

	if (!isUp) {
		logger.warn("ROUTER", "[V-SQR-06-08] Primary server down, using catchup");
		if (squirrel.config.allowCatchupServer) {
			return useCatchupServer({
				squirrel,
				data,
				req,
				res,
				target,
			});
		} else {
			return res.status(503).json({
				err: true,
				msg: "No catchup server available",
			});
		}
	}

	const host = target.server.redirectHost || target.server.host;
	const redirectUrl = `${host.endsWith("/") ? host : host + "/"}db/${op}`;
	logger.debug("ROUTER", "[V-SQR-06-09] redirect:", redirectUrl);
	res.redirect(redirectUrl, HTTP_STATUS.TEMPORARY_REDIRECT);
}
