import { isValtheraError } from "@wxn0brp/db-core/errors";
import type { AdapterCapabilities } from "@wxn0brp/db-core/types/action";
import { VQuery } from "@wxn0brp/db-core/types/query";
import { isCollectionOp, isKnownOp } from "@wxn0brp/db-core/utils/opKind";
import { FFResponse } from "@wxn0brp/falcon-frame";
import { deserializeFunctions } from "@wxn0brp/wts-run-fn";
import { dataCenter } from "../../init/initDataBases";
import { runtime_dir } from "../../init/vars";
import { isPathSafe } from "../../utils/path";
import logger from "../../utils/logger";
import { checkAnyAccess, checkPermission } from "../../utils/perm";
import { deserializeRegex } from "../../utils/regex";
import { beginTx, commitTx, getSession, rollbackTx, touch } from "./tx";

export interface Query {
	type: string;
	// db: ValtheraCompatible;
	dbName: string;
	// dbDir: string;
	userId: string;
	query: VQuery;
	keys: string[][];
	undefinedPaths?: string[][];
}

function restoreUndefined(query: VQuery, paths: string[][]) {
	if (!Array.isArray(paths) || paths.length > 1000)
		throw new Error("Invalid undefined paths");
	for (const path of paths) {
		if (
			!Array.isArray(path) ||
			path.length < 2 ||
			path.length > 16 ||
			path[0] !== "updater" ||
			path.some(
				part =>
					typeof part !== "string" ||
					!part ||
					[
						"__proto__",
						"prototype",
						"constructor",
					].includes(part),
			)
		)
			throw new Error("Invalid undefined path");
		let target: any = query;
		for (const part of path.slice(0, -1)) {
			if (
				!target ||
				typeof target !== "object" ||
				Array.isArray(target) ||
				!Object.hasOwn(target, part)
			)
				throw new Error("Invalid undefined path");
			target = target[part];
		}
		if (!target || typeof target !== "object" || Array.isArray(target))
			throw new Error("Invalid undefined path");
		target[path[path.length - 1]] = undefined;
	}
}

export class Response {
	err: boolean;
	result: any;
	msg: Codes | string;
	code?: number;
	errorCode?: string;
	suggestion?: string;
	context?: Record<string, unknown>;

	e(msg: Codes, code: number = 400) {
		this.err = true;
		this.msg = msg;
		this.code = code;
		return this;
	}

	r(result: any) {
		this.err = false;
		this.result = result;
		return this;
	}

	error(err: unknown, code: number = 500) {
		this.err = true;
		this.msg = (err as any)?.message ?? String(err);
		this.code = code;
		if (isValtheraError(err)) {
			this.errorCode = err.code;
			this.suggestion = err.suggestion;
			this.context = err.context;
		}
		return this;
	}

	ff(res: FFResponse) {
		const response: any = {
			err: this.err,
		};
		if (this.code) res.status(this.code);
		if (this.msg) response.msg = this.msg;
		if (this.errorCode) response.code = this.errorCode;
		if (this.suggestion) response.suggestion = this.suggestion;
		if (this.context) response.context = this.context;
		if (this.result !== undefined) response.result = this.result;
		return res.json(response);
	}
}

export enum Codes {
	INVALID_DB = "Invalid data center.",
	TYPE_REQ = "type is required",
	INVALID_TYPE = "invalid type",
	ACCESS_DENIED = "access denied",
	QUERY_REQ = "query is required",
	QUERY_REQ_OBJ = "query must be an object",
	COLLECTION_REQ = "collection is required",
	INVALID_COLLECTION = "invalid collection",
	COLLECTIONS_REQ = "collections is required",
	TRANSACTION_REQ = "transaction is required",
	INVALID_TRANSACTION = "invalid or expired transaction",
	COLLECTION_NOT_IN_TRANSACTION = "collection is not part of the transaction",
}

const txControl = new Set([
	"beginTransaction",
	"commitTransaction",
	"rollbackTransaction",
]);

const SERVER_CAPABILITIES: AdapterCapabilities = {
	transactions: true,
	indexes: false,
	persistent: true,
};

function intersectCapabilities(caps: AdapterCapabilities) {
	return {
		transactions: caps.transactions && SERVER_CAPABILITIES.transactions,
		indexes: caps.indexes && SERVER_CAPABILITIES.indexes,
		persistent: caps.persistent && SERVER_CAPABILITIES.persistent,
	};
}

export async function dbLogic(serverQuery: Query): Promise<Response> {
	const { type, dbName, userId, query, keys, undefinedPaths } = serverQuery;
	const res = new Response();

	const dbObj = dataCenter[dbName];
	if (!dbObj) return res.e(Codes.INVALID_DB);
	if (!type) return res.e(Codes.TYPE_REQ);

	const { db, dir: dbDir } = dbObj;

	if (txControl.has(type)) {
		try {
			if (!(await checkAnyAccess(userId, dbName)))
				return res.e(Codes.ACCESS_DENIED, 403);

			if (type === "beginTransaction") {
				const collections = (query as any)?.collections;
				if (!Array.isArray(collections) || !collections.length)
					return res.e(Codes.COLLECTIONS_REQ);

				for (const collection of collections) {
					if (
						typeof collection !== "string" ||
						!collection ||
						!isPathSafe(runtime_dir, dbDir, collection)
					)
						return res.e(Codes.INVALID_COLLECTION);
				}

				const id = await beginTx(db, dbName, userId, collections);
				return res.r({
					id,
				});
			}

			const id = query?.transaction?.id;
			if (!id) return res.e(Codes.TRANSACTION_REQ);

			if (type === "commitTransaction") {
				await commitTx(id, userId, dbName);
				return res.r(true);
			}

			await rollbackTx(id, userId, dbName);
			return res.r(true);
		} catch (err) {
			logger.error(err);
			return res.error(err);
		}
	}

	try {
		if (!isKnownOp(type)) return res.e(Codes.INVALID_TYPE);
		if (!db[type] || typeof db[type] !== "function")
			return res.e(Codes.INVALID_TYPE);

		if (!(await checkPermission(userId, type, dbName)))
			return res.e(Codes.ACCESS_DENIED, 403);

		if (type === "getCollections") {
			const collections = await db.getCollections();
			return res.r(collections);
		}

		if (type === "capabilities") {
			const caps = await db.capabilities();
			return res.r(intersectCapabilities(caps));
		}

		if (!query) return res.e(Codes.QUERY_REQ);
		if (typeof query !== "object") return res.e(Codes.QUERY_REQ_OBJ);
		if (!query.collection) return res.e(Codes.COLLECTION_REQ);

		const withFns = deserializeFunctions(query, keys || []) as VQuery;
		if (undefinedPaths?.length) restoreUndefined(withFns, undefinedPaths);
		const parsedVQuery = (
			withFns.search
				? {
						...withFns,
						search: deserializeRegex(withFns.search),
					}
				: withFns
		) as VQuery;

		if (!isPathSafe(runtime_dir, dbDir, query.collection))
			return res.e(Codes.INVALID_COLLECTION);

		const txId = parsedVQuery?.transaction?.id;
		if (txId) {
			const session = getSession(txId);
			if (!session) return res.e(Codes.INVALID_TRANSACTION);
			if (session.userId !== userId || session.dbName !== dbName)
				return res.e(Codes.ACCESS_DENIED, 403);
			if (!session.collections.has(parsedVQuery.collection))
				return res.e(Codes.COLLECTION_NOT_IN_TRANSACTION);

			touch(session);

			if (isCollectionOp(type))
				return res.r(
					await db.execute(
						type as any,
						parsedVQuery.collection,
						session.handle,
					),
				);

			return res.r(await db.execute(type as any, parsedVQuery, session.handle));
		}

		if (isCollectionOp(type))
			return res.r(await db[type](parsedVQuery.collection));

		return res.r(await db[type](parsedVQuery));
	} catch (err) {
		logger.error(err);
		return res.error(err);
	}
}
