import { VQuery } from "@wxn0brp/db-core/types/query";
import { FFRequest, FFResponse } from "@wxn0brp/falcon-frame";
import { logger } from "../logger";
import { Squirrel } from "../squirrel";
import { CatchupEntry, Epoch, ServerEpochInfo } from "../types";
import { COLLECTIONS, HTTP_STATUS } from "../vars";

export interface CatchupServerOpts {
	squirrel: Squirrel;
	data: VQuery;
	req: FFRequest;
	res: FFResponse;
	target: ServerEpochInfo;
}

export async function useCatchupServer({
	squirrel,
	data,
	req,
	res,
	target,
}: CatchupServerOpts) {
	logger.debug(
		"CATCHUP",
		"[V-SQR-08-01] Using catchup server for op:",
		req.params.op,
		"target:",
		target.server.id,
	);

	switch (req.params.op) {
		case "find":
		case "findOne":
		case "issetCollection":
		case "getCollections":
			return res.json({
				err: true,
				msg: "Catchup server does not support find",
			});
	}

	const addResult = await useCatchupServerLogic(
		squirrel,
		data,
		req.params.op,
		target.server.id,
		target.epoch,
	);
	if ("err" in addResult) return res.status(503).json(addResult);

	res.status(HTTP_STATUS.MULTI_STATUS).json({
		err: true,
		msg: "Successfully added to catchup server",
		result: addResult,
	});
}

export async function useCatchupServerLogic(
	squirrel: Squirrel,
	data: VQuery,
	op: string,
	serverId: string,
	epoch: Epoch,
) {
	const catchup = await squirrel.topology.getCatchupServer(serverId, epoch);
	if (!catchup) {
		logger.error(
			"CATCHUP",
			"[V-SQR-15-02] No catchup server available for:",
			serverId,
		);
		return {
			err: true,
			msg: "No catchup server available",
		};
	}

	logger.debug("CATCHUP", "[V-SQR-15-03] Using catchup server:", catchup.id);

	const client = squirrel.getClient(catchup.host);

	let addResult: CatchupEntry;
	try {
		addResult = await client.add<CatchupEntry>({
			collection: COLLECTIONS.SQUIRREL_CATCHUP,
			data: {
				to: serverId,
				op: op,
				v: data,
				time: Date.now(),
			},
		});
	} catch (e) {
		logger.error(
			"CATCHUP",
			"[V-SQR-15-04] Failed to add to catchup server:",
			catchup.id,
			e.message,
		);
		return {
			err: true,
			msg: e.message,
		};
	}

	logger.debug(
		"CATCHUP",
		"[V-SQR-15-05] Successfully added to catchup server:",
		serverId,
		addResult,
	);
	return addResult;
}
