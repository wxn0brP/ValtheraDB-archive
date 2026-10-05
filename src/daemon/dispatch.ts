import { DbRegistry } from "./registry";
import { ConduitError } from "./errors";
import { decodeJsonPayload } from "../protocol/framing";
import {
	CloseDbPayload,
	ExecuteJsonPayload,
	Frame,
	InitDbPayload,
	InboundFrameType,
	OutboundFrameType,
} from "../protocol/types";
import { conduitInfo } from "../versions";

export interface DispatchResult {
	type: OutboundFrameType;
	payload: unknown;
	shutdown?: boolean;
}

export async function dispatchFrame(
	registry: DbRegistry,
	frame: Frame,
): Promise<DispatchResult> {
	switch (frame.type) {
		case InboundFrameType.InitDb: {
			const payload = decodeJsonPayload<InitDbPayload>(frame);
			const result = await registry.init(
				frame.dbName,
				payload.dir,
				payload.opts || {},
			);
			return {
				type: OutboundFrameType.Result,
				payload: {
					ok: true,
					result,
				},
			};
		}
		case InboundFrameType.ExecuteJson: {
			const payload = decodeJsonPayload<ExecuteJsonPayload>(frame);
			const result = await registry.execute(
				frame.dbName,
				payload.op,
				payload.body,
			);
			return {
				type: OutboundFrameType.Result,
				payload: {
					ok: true,
					result,
				},
			};
		}
		case InboundFrameType.CloseDb: {
			decodeJsonPayload<CloseDbPayload>(frame);
			const result = await registry.close(frame.dbName);
			return {
				type: OutboundFrameType.Result,
				payload: {
					ok: true,
					result,
				},
			};
		}
		case InboundFrameType.ListDbs:
			return {
				type: OutboundFrameType.Result,
				payload: {
					ok: true,
					result: registry.list(),
				},
			};
		case InboundFrameType.Ping:
			return {
				type: OutboundFrameType.Pong,
				payload: {
					ok: true,
					result: conduitInfo,
				},
			};
		case InboundFrameType.Shutdown: {
			const result = await registry.closeAll();
			return {
				type: OutboundFrameType.Result,
				payload: {
					ok: true,
					result,
				},
				shutdown: true,
			};
		}
		default:
			throw new ConduitError(
				"UNKNOWN_FRAME",
				`unknown frame type ${frame.type}`,
			);
	}
}
