import { forgeTypedValthera, ValtheraClass } from "@wxn0brp/db-core";
import type { Collection } from "@wxn0brp/db-core/helpers/collection";
import { DbStorageGed } from "./action";
import type { GedEntry, GedTag } from "./types";

export type GedCollections<Tags extends string = GedTag> = {
	[K in Tags]: Collection<GedEntry>;
};

export function createGedValthera<Tags extends string = GedTag>(
	file: string,
): ValtheraClass & GedCollections<Tags> {
	const adapter = new DbStorageGed(file);
	return forgeTypedValthera(
		new ValtheraClass({
			adapter,
		}),
	) as any;
}

export * from "./action";
export * from "./types";
