import { ValtheraClass } from "@wxn0brp/db-core";
import { Collection } from "@wxn0brp/db-core/helpers/collection";
import type { ActionsBaseInterface } from "@wxn0brp/db-core/types/action";
import { Data } from "@wxn0brp/db-core/types/data";
import { ScopeBase } from "./scope";

export interface Opts {
	name?: string;
	opts?: any[];
	def?: string;
	force?: string;
}

export interface ResolvedConfig {
	pkg: string;
	variant?: string;
	opts: any[];
}

export type Adapter = (
	...args: any[]
) => Promise<ActionsBaseInterface> | ActionsBaseInterface;

export type ValtheraLazy<T extends Record<string, Data> = {}> =
	ValtheraClass & {
		[K in keyof T]: Collection<T[K]>;
	};

export type _ReplaceReturn<T, S extends Record<string, Data>> = T extends (
	...args: infer A
) => any
	? ((...args: A) => ValtheraLazy<S>) & {
			[K in keyof T]: _ReplaceReturn<T[K], S>;
		}
	: T extends object
		? { [K in keyof T]: _ReplaceReturn<T[K], S> }
		: T;

export type ValtheraScope<T extends Record<string, Data>> = {
	[K in keyof ScopeBase]: _ReplaceReturn<ScopeBase[K], T>;
};
