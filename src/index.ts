import { forgeTypedValthera, ValtheraClass } from "@wxn0brp/db-core";
import { Collection } from "@wxn0brp/db-core/helpers/collection";
import { LogAdapter } from "./adapter";
import { AnyRecord } from "./types";

export * from "./adapter";
export * from "./record";
export * from "./segment";

export type LogCollections<Tags extends string = string> = {
	[K in Tags]: Collection<AnyRecord>;
};

export function createLogValthera<Tags extends string = string>(
	rootDir: string,
): ValtheraClass & LogCollections<Tags> {
	const adapter = new LogAdapter(rootDir);
	const db = new ValtheraClass({
		adapter,
	});
	return forgeTypedValthera(db) as any;
}

export const DYNAMIC = {
	def: (rootDir: string) => new LogAdapter(rootDir),
	log: (rootDir: string) => new LogAdapter(rootDir),
};
