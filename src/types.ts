export type MariaDBMode = "strict" | "lazy";
export type CompositeEncoding = "blob" | "json";
export type MariaDBDriver = "mariadb" | "mysql2" | "bun";

export interface MariaDBValtheraOptions {
	database?: string;
	mode?: MariaDBMode;
	primaryKey?: string | Record<string, string>;
	compositeEncoding?: CompositeEncoding;
	connectionString?: string;
	driver?: MariaDBDriver;
}

export type MariaDBQueryResult<T> =
	| T[]
	| {
			rows: T[];
	  }
	| [
			T[],
			unknown,
	  ];

export interface QueryableMariaDB {
	query<T = Record<string, any>>(
		sql: string,
		values?: any[],
	): Promise<MariaDBQueryResult<T>>;
	getConnection?(): Promise<QueryableMariaDB>;
	release?(): void;
	end?(...args: any[]): Promise<void> | void;
	destroy?(...args: any[]): any;
}

export interface QueryableBunSQL {
	unsafe<T = Record<string, any>>(
		sql: string,
		values?: any[] | Record<string, any>,
	): PromiseLike<MariaDBQueryResult<T>>;
	reserve?(): Promise<QueryableBunSQL>;
	release?(): void;
	end?(...args: any[]): Promise<void> | void;
	close?(...args: any[]): Promise<void> | void;
}

export type MariaDBConnection = QueryableMariaDB | QueryableBunSQL;

export const MARIADB_STORAGE_ID = Symbol.for("valthera.mariadb.storageId");
