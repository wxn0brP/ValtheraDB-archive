import type { VQueryT } from "@wxn0brp/db-core/types/query";
import { fullScanReq } from "../router/fullScan";
import { Squirrel } from "../squirrel";
import { replicationFind } from "./find";

export async function replicationCount(
	squirrel: Squirrel,
	id: string,
	query: VQueryT.Count,
): Promise<number> {
	if (id) {
		const rows = await replicationFind(squirrel, id, query as any);
		return rows.length;
	}
	return fullScanReq(squirrel, query as any, "count");
}
