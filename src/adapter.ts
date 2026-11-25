import { pathRepair } from "@wxn0brp/db-core/base/customFileCpu";
import type { VQueryT } from "@wxn0brp/db-core/types/query";
import { FileAdapter } from "@wxn0brp/db-storage-dir";
import { FileAdapterUtils } from "@wxn0brp/db-storage-dir/adapter.utils";
import { access } from "fs/promises";
import { join } from "path";
import { createIndex } from "./idx/create";
import {
	addToIndex,
	findIndex,
	removeFromIndexByData,
	updateIndex,
} from "./idx/operations";
import { PageManager } from "./idx/page";
import { create } from "./idx/page/utils";
import type { IndexConfig } from "./types";
import { convertResultToArray, getCollectionAndFileNum } from "./utils";
import { AnotherCache } from "@wxn0brp/ac";

export interface IndexDirActions extends FileAdapter {
	createIndex(config: VQueryT.CreateIndex | string): Promise<void>;
}

export function createIndexDirAdapter(
	action: FileAdapter,
	indexConfig: IndexConfig,
): IndexDirActions {
	const getSortedFilesOriginal: FileAdapterUtils["getSortedFiles"] =
		action.utils.getSortedFiles.bind(action.utils);

	const pmCaches = new Map<string, Map<string, PageManager>>();
	const indexExistsCache = new AnotherCache<boolean>();

	const getPM = async (
		collection: string,
		key: string,
	): Promise<PageManager> => {
		let colMap = pmCaches.get(collection);
		if (!colMap) {
			colMap = new Map();
			pmCaches.set(collection, colMap);
		}
		let pm = colMap.get(key);
		if (!pm) {
			const indexPath = join(
				action.folder,
				pathRepair(collection),
				`${key}.idx`,
			);
			pm = await create(indexPath);
			colMap.set(key, pm);
		}
		return pm;
	};

	const getPMs = async (
		collection: string,
		keys: string[],
	): Promise<Map<string, PageManager>> => {
		const result = new Map<string, PageManager>();
		for (const key of keys) {
			result.set(key, await getPM(collection, key));
		}
		return result;
	};

	const getSortedFiles: FileAdapterUtils["getSortedFiles"] = async (
		folder,
		query,
		opts,
	) => {
		const files = await getSortedFilesOriginal(folder, query, opts);
		const collectionKeys = Object.hasOwn(indexConfig, query.collection)
			? indexConfig[query.collection]
			: undefined;

		if (!collectionKeys || !query.search || typeof query.search !== "object")
			return files;

		let candidateFiles: Set<number> = null;

		for (const key of collectionKeys) {
			if (!Object.hasOwn(query.search, key)) continue;

			const searchData = (query.search as any)[key];
			if (searchData === undefined) continue;
			// exact-match only: operators, regex and object values fall through to a full scan
			if (typeof searchData === "object" && searchData !== null) continue;

			const cacheKey = `${query.collection}:${key}`;
			if (!indexExistsCache.has(cacheKey)) {
				const indexPath = join(
					action.folder,
					pathRepair(query.collection),
					`${key}.idx`,
				);
				try {
					await access(indexPath);
					indexExistsCache.set(cacheKey, true);
				} catch {
					indexExistsCache.set(cacheKey, false);
					continue;
				}
			} else {
				if (!indexExistsCache.get(cacheKey)) continue;
			}

			const pm = await getPM(query.collection, key);
			const foundIndices = await findIndex(searchData, pm);
			const foundSet = new Set(foundIndices);

			if (candidateFiles === null) {
				candidateFiles = foundSet;
			} else {
				candidateFiles = new Set(
					[
						...candidateFiles,
					].filter(x => foundSet.has(x)),
				);
			}

			if (candidateFiles.size === 0) break;
		}

		if (candidateFiles === null) {
			return files;
		}

		const filteredFiles = files.filter(file => {
			const index = parseInt(file.replace(".db", ""), 10);
			return candidateFiles!.has(index);
		});

		query.control._dirIndex_files = filteredFiles;

		return filteredFiles;
	};

	action.utils.getSortedFiles = getSortedFiles.bind(action.utils);

	const originalFileCpu = action.fileCpu;
	action.fileCpu = new Proxy(originalFileCpu, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (typeof value !== "function") return value;

			if (prop === "add") {
				return async (file: string, config: VQueryT.Add, opts: any) => {
					const result = await value.call(target, file, config, opts);
					const { collection, fileNum } = getCollectionAndFileNum(
						file,
						action.folder,
					);
					const keys = indexConfig[collection];
					if (keys) {
						const pms = await getPMs(collection, keys);
						await addToIndex(config.data, fileNum, keys, pms);
					}

					return result;
				};
			}

			if (prop === "remove") {
				return async (
					file: string,
					config: VQueryT.Remove,
					one: boolean,
					opts: any,
				) => {
					const { collection, fileNum } = getCollectionAndFileNum(
						file,
						action.folder,
					);
					const keys = indexConfig[collection];

					const result = await value.call(target, file, config, one, opts);

					if (!keys) return result;

					const matches = convertResultToArray(result);

					if (matches.length > 0) {
						const pms = await getPMs(collection, keys);
						await removeFromIndexByData(matches, fileNum, keys, pms);
					}

					return result;
				};
			}

			if (prop === "update") {
				return async (
					file: string,
					config: VQueryT.Update,
					one: boolean,
					opts: any,
				) => {
					const { collection, fileNum } = getCollectionAndFileNum(
						file,
						action.folder,
					);
					const keys = indexConfig[collection];

					if (!keys) return await value.call(target, file, config, one, opts);

					const findResults = await target.find(file, config, opts);
					if (!findResults || findResults.length === 0) return [];

					const result = await value.call(target, file, config, one, opts);

					const pms = await getPMs(collection, keys);
					await updateIndex(
						one ? findResults.slice(0, 1) : findResults,
						convertResultToArray(result),
						fileNum,
						keys,
						pms,
					);

					return result;
				};
			}

			return value.bind(target);
		},
	});

	const indexDirAction = action as IndexDirActions;
	const dirCaps = (action as any).capabilities ?? {};
	(indexDirAction as any).capabilities = {
		transactions: dirCaps.transactions ?? true,
		indexes: true,
		persistent: dirCaps.persistent ?? true,
	};
	indexDirAction.createIndex = async (config: VQueryT.CreateIndex | string) => {
		const index = typeof config === "string" ? undefined : config.index;
		const collection = pathRepair(
			typeof config === "string" ? config : config.collection,
		);
		const keys =
			index?.fields ||
			(Object.hasOwn(indexConfig, collection)
				? indexConfig[collection]
				: undefined);
		if (!keys) return;

		const colMap = pmCaches.get(collection);
		if (colMap) {
			for (const pm of colMap.values()) {
				await pm.close();
			}
			colMap.clear();
		}

		await createIndex(action, collection, keys);

		for (const key of keys) {
			indexExistsCache.set(`${collection}:${key}`, true);
		}
	};

	return indexDirAction;
}
