import { ErrorPayload } from "../protocol/types";

export class ConduitError extends Error {
	constructor(
		public code: string,
		message: string,
		public details?: any,
	) {
		super(message);
		this.name = "ConduitError";
	}
}

export function toErrorPayload(error: unknown): ErrorPayload {
	if (error instanceof ConduitError) {
		return {
			ok: false,
			code: error.code,
			message: error.message,
			details: error.details,
		};
	}

	if (error instanceof Error) {
		return {
			ok: false,
			code: "INTERNAL_ERROR",
			message: error.message,
		};
	}

	return {
		ok: false,
		code: "INTERNAL_ERROR",
		message: String(error),
	};
}
