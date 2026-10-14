import { ErrorCodes, isValtheraError, ValtheraClass } from "@wxn0brp/db-core";
import type { TestDefinition } from "../types";

const CAPABILITY_KEYS = [
	"transactions",
	"indexes",
	"persistent",
] as const;

export const capabilitiesTests: TestDefinition[] = [
	{
		domain: "capabilities",
		name: "capabilities-shape",
		fn: async (db: ValtheraClass) => {
			const caps = await db.capabilities();
			if (!caps || typeof caps !== "object")
				throw new Error("capabilities() must return an object");

			for (const key of CAPABILITY_KEYS) {
				if (typeof caps[key] !== "boolean")
					throw new Error(`capabilities().${key} must be a boolean`);
			}
		},
	},
	{
		domain: "capabilities",
		name: "capabilities-consistent",
		fn: async (db: ValtheraClass) => {
			const first = await db.capabilities();
			const second = await db.capabilities();

			for (const key of CAPABILITY_KEYS) {
				if (first[key] !== second[key])
					throw new Error(`capabilities().${key} changed between calls`);
			}
		},
	},
	{
		domain: "capabilities",
		name: "capabilities-unsupported-operation",
		fn: async (db: ValtheraClass) => {
			const caps = await db.capabilities();
			// Only meaningful when the adapter declares no transaction support.
			if (caps.transactions) return;

			let caught: unknown;
			try {
				await db.transaction(
					[
						"cap-probe",
					],
					async () => {},
				);
			} catch (err) {
				caught = err;
			}

			if (!caught)
				throw new Error(
					"transaction() should reject when capabilities.transactions is false",
				);
			// ValtheraClass always wraps adapter errors, so it must be a ValtheraError.
			if (!isValtheraError(caught))
				throw new Error("transaction() must throw a ValtheraError");

			// The adapter runs its own db-core copy, so the original error may be
			// wrapped into AdapterError; accept the code either on the error or its cause.
			const cause = (
				caught as {
					cause?: {
						code?: string;
					};
				}
			).cause;
			const unsupported =
				caught.code === ErrorCodes.UNSUPPORTED_OPERATION ||
				cause?.code === ErrorCodes.UNSUPPORTED_OPERATION;

			if (!unsupported)
				throw new Error(
					`Expected ${ErrorCodes.UNSUPPORTED_OPERATION}, got ${caught.code}`,
				);
		},
	},
];
