import { QueryValidationError } from "@wxn0brp/db-core/errors";

export function quoteIdentifier(identifier: string) {
	if (!identifier)
		throw new QueryValidationError("PostgreSQL identifier cannot be empty", {
			identifier,
		});
	return `"${identifier.replace(/"/g, `""`)}"`;
}

export function columnForField(field: string) {
	return field;
}

export function sqlColumnForField(field: string) {
	return quoteIdentifier(columnForField(field));
}
