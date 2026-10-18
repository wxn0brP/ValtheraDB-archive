import { ValtheraClass } from "@wxn0brp/db-core";
import { forgeTypedValthera } from "@wxn0brp/db-core/helpers/forge";
import { Data } from "@wxn0brp/db-core/types/data";
import { createAdapter } from "./load";
import { Opts, ValtheraScope } from "./types";

function createAdapterBuilder(pkgName: string, scopeOpts: Opts) {
	const buildDb = (variant: string | undefined, ...args: any[]) => {
		const adapterOpts = args.length > 0 ? args : (scopeOpts.opts ?? []);

		const finalOpts: Opts = {
			...scopeOpts,
			def: variant ? `${pkgName}:${variant}` : pkgName,
			opts: adapterOpts,
		};

		const vdb = new ValtheraClass({
			adapter: () => createAdapter(finalOpts),
		});

		return forgeTypedValthera(vdb);
	};

	const defaultExecute = (...args: any[]) => {
		return buildDb(undefined, ...args);
	};

	return new Proxy(defaultExecute, {
		get(target, prop) {
			if (typeof prop !== "string") return Reflect.get(target, prop);

			return (...args: any[]) => {
				return buildDb(prop, ...args);
			};
		},
		apply(target, thisArg, args) {
			return Reflect.apply(target, thisArg, args);
		},
	});
}

export function VDB<T extends Record<string, Data> = {}>(
	name = "master",
	baseOpts: Opts = {},
): ValtheraScope<T> {
	return new Proxy(
		{},
		{
			get(_, prop) {
				if (typeof prop !== "string") return undefined;
				const pkgName = prop;

				return createAdapterBuilder(pkgName, {
					...baseOpts,
					name,
				});
			},
		},
	) as any;
}
