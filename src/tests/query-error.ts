import { ErrorCodes, isValtheraError } from "@wxn0brp/db-core";

export function isQueryValidationFailure(error: unknown) {
	if (!isValtheraError(error)) return false;
	if (error.code === ErrorCodes.QUERY_INVALID) return true;
	if (error.code !== ErrorCodes.ADAPTER_ERROR) return false;
	return (
		(
			error.cause as
				| {
						code?: string;
				  }
				| undefined
		)?.code === ErrorCodes.QUERY_INVALID
	);
}
