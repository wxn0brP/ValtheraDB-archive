import type { Client, Pool, QueryResult, QueryResultRow } from "pg";

export type SupportedPostgreSQL = Pool | Client;
export type PostgreSQLValtheraMode = "strict" | "lazy";

export interface PostgreSQLValtheraOptions {
	schema?: string;
	mode?: PostgreSQLValtheraMode;
	primaryKey?: string | Record<string, string>;
}

export interface QueryablePostgreSQL {
	query<T extends QueryResultRow = QueryResultRow>(
		text: string,
		values?: any[],
	): Promise<QueryResult<T>>;
	end?: () => Promise<void> | void;
}

export const POSTGRES_STORAGE_ID = Symbol.for("valthera.postgres.storageId");
