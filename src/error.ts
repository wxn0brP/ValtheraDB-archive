import { inspect } from "node:util";

export interface DescribedError {
	name?: string;
	message: string;
	code?: string;
	stack?: string;
}

function inspectValue(value: unknown) {
	return inspect(value, {
		depth: 4,
	});
}

function getCode(record: Record<string, unknown>) {
	const code = record.code;
	if (typeof code === "string" && code.length > 0) return code;
	if (typeof code === "number") return String(code);
	return undefined;
}

export function describeError(err: unknown): DescribedError {
	if (err instanceof Error) {
		return {
			name: err.name,
			message: err.message || "(empty message)",
			code: getCode(err as unknown as Record<string, unknown>),
			stack: err.stack,
		};
	}

	if (typeof err === "object" && err !== null) {
		const record = err as Record<string, unknown>;
		const hasMessage =
			typeof record.message === "string" && record.message.length > 0;

		return {
			name: typeof record.name === "string" ? record.name : undefined,
			message: hasMessage ? (record.message as string) : inspectValue(err),
			code: getCode(record),
			stack: typeof record.stack === "string" ? record.stack : undefined,
		};
	}

	return {
		message: typeof err === "string" ? err : inspectValue(err),
	};
}

export function formatError(err: unknown) {
	const { name, message } = describeError(err);
	return name ? `${name}: ${message}` : message;
}
