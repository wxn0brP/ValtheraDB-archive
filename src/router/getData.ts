import { logger } from "../logger";
import { Squirrel } from "../squirrel";
import { CatchupEntry } from "../types";
import { COLLECTIONS } from "../vars";
import { fullScanReq } from "./fullScan";

export function registerGetData(squirrel: Squirrel) {
	if (!squirrel.config.allowCatchupServer) {
		logger.info(
			"SYNC",
			"[V-SQR-16-01] Catchup server disabled, skipping getData routes",
		);
		return;
	}

	squirrel.app.post("/squirrel/welcome-back", (req, res) =>
		welcomeBack(squirrel, req.body._id),
	);
}

export async function welcomeBack(squirrel: Squirrel, _id: string) {
	if (!_id)
		return {
			err: true,
			msg: "Missing id",
		};

	logger.debug("SYNC", "[V-SQR-16-07] Welcome-back request for server:", _id);

	const host = squirrel.topology.servers.get(_id)?.host;

	if (!host)
		return {
			err: true,
			msg: "Server not found",
		};

	const isUp = await squirrel.topology.isServerUp(host);
	if (!isUp) {
		logger.warn("SYNC", "[V-SQR-16-08] Lie. Server down, skipping:", _id);
		return {
			err: true,
			msg: "Server down",
		};
	}

	const data: CatchupEntry[] = await fullScanReq(
		squirrel,
		{
			collection: COLLECTIONS.SQUIRREL_CATCHUP,
			search: {
				to: _id,
			},
		},
		"find",
	);

	data.sort((a, b) => a.time - b.time);

	const client = squirrel.getClient(host);

	const replayed: CatchupEntry[] = [];

	for (const d of data) {
		try {
			await client[d.op](d.v);
			replayed.push(d);
		} catch (e) {
			await removeCatchupEntries(squirrel, replayed, _id);
			return {
				err: true,
				msg: e.message,
			};
		}
	}

	await removeCatchupEntries(squirrel, data, _id);

	return {
		err: false,
	};
}

async function removeCatchupEntries(
	squirrel: Squirrel,
	data: CatchupEntry[],
	to: string,
) {
	const withId = data.filter(d => "_id" in d);
	if (!withId.length) return;

	for (const d of withId) {
		await fullScanReq(
			squirrel,
			{
				collection: COLLECTIONS.SQUIRREL_CATCHUP,
				search: {
					_id: (d as any)._id,
					to,
				},
			},
			"remove",
		);
	}
}
