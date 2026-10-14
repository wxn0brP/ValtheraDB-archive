import {
	ErrorCodes,
	isValtheraError,
	ValtheraClass,
	ValtheraError,
} from "@wxn0brp/db-core";
import type { TestDefinition } from "../types";

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
	try {
		await fn();
	} catch (err) {
		return err;
	}
	return undefined;
}

export const errorsTests: TestDefinition[] = [
	{
		domain: "errors",
		name: "error-query-validation-missing-collection",
		fn: async (db: ValtheraClass) => {
			const caught = await captureError(() =>
				(db as any).find({
					search: {},
				}),
			);

			if (!caught) throw new Error("find() without collection should reject");
			if (!isValtheraError(caught))
				throw new Error("error must be a ValtheraError");
			if (caught.code !== ErrorCodes.QUERY_INVALID)
				throw new Error(
					`Expected code ${ErrorCodes.QUERY_INVALID}, got ${caught.code}`,
				);
		},
	},
	{
		domain: "errors",
		name: "error-is-valthera-error-guard",
		fn: async () => {
			if (isValtheraError(new Error("plain")))
				throw new Error("isValtheraError should be false for a plain Error");
			if (
				!isValtheraError(
					new ValtheraError("boom", {
						code: "TEST",
					}),
				)
			)
				throw new Error("isValtheraError should be true for a ValtheraError");
		},
	},
	{
		domain: "errors",
		name: "error-metadata",
		fn: async (db: ValtheraClass) => {
			const caught = await captureError(() =>
				(db as any).find({
					search: {},
				}),
			);

			if (!isValtheraError(caught)) throw new Error("expected a ValtheraError");
			if (caught.name !== "QueryValidationError")
				throw new Error(`Unexpected error name: ${caught.name}`);
			if (typeof caught.message !== "string" || caught.message.length === 0)
				throw new Error("error must have a message");
			if (typeof caught.code !== "string" || caught.code.length === 0)
				throw new Error("error must have a code");
		},
	},
];
