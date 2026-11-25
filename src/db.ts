import type { ValtheraClass } from "@wxn0brp/db-core/db/valthera";
import { isValtheraError } from "@wxn0brp/db-core/errors";
import { VQuery } from "@wxn0brp/db-core/types/query";
import { getOpKind, isKnownOp } from "@wxn0brp/db-core/utils/opKind";
import { FFResponse, Router } from "@wxn0brp/falcon-frame";
import { isAbsolute, resolve, sep } from "path";
import { gitDir } from "./vars";

export interface Query {
	type: string;
	query: VQuery;
}

export class Response {
	err: boolean = false;
	result: any;
	msg: string = "";
	code?: number;
	errorCode?: string;
	suggestion?: string;
	context?: Record<string, unknown>;

	e(msg: string, code: number = 400) {
		this.err = true;
		this.msg = msg;
		this.code = code;
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

	r(result: any) {
		this.err = false;
		this.result = result;
		return this;
	}

	ff(res: FFResponse) {
		const response: any = {
			err: this.err,
		};
		if (this.code) res.status(this.code);
		if (this.msg) response.msg = this.msg;
		if (this.result !== undefined) response.result = this.result;
		if (this.errorCode) response.code = this.errorCode;
		if (this.suggestion) response.suggestion = this.suggestion;
		if (this.context) response.context = this.context;
		return res.json(response);
	}
}

export enum Codes {
	TYPE_REQ = "type is required",
	INVALID_TYPE = "invalid type",
	ACCESS_DENIED = "access denied",
	QUERY_REQ = "query is required",
	QUERY_REQ_OBJ = "query must be an object",
	COLLECTION_REQ = "collection is required",
	INVALID_COLLECTION = "invalid collection",
}

const dbRoot = resolve(gitDir);

function isPathSafe(collection: string) {
	if (typeof collection !== "string" || !collection) return false;
	if (collection.includes("\0") || collection.includes("\\")) return false;
	if (isAbsolute(collection)) return false;
	const segments = collection.split("/");
	if (segments.some(segment => !segment || segment.startsWith(".")))
		return false;
	const resolved = resolve(dbRoot, collection);
	if (resolved === dbRoot) return false;
	return resolved.startsWith(dbRoot + sep);
}

export function createDbRouter(db: ValtheraClass) {
	const router = new Router();

	async function dbLogic(serverQuery: Query): Promise<Response> {
		const { type, query } = serverQuery;
		const res = new Response();

		if (!type) return res.e(Codes.TYPE_REQ);

		try {
			if (!isKnownOp(type)) return res.e(Codes.INVALID_TYPE);

			if (!db[type] || typeof db[type] !== "function")
				return res.e(Codes.INVALID_TYPE);

			if (type === "getCollections") {
				console.log("[OP] getCollections");
				const collections = await db.getCollections();
				return res.r(collections);
			}

			if (type === "capabilities") {
				const caps = await db.capabilities();
				return res.r(caps);
			}

			if (!query) return res.e(Codes.QUERY_REQ);
			if (typeof query !== "object") return res.e(Codes.QUERY_REQ_OBJ);
			if (!query.collection) return res.e(Codes.COLLECTION_REQ);

			if (!isPathSafe(query.collection)) return res.e(Codes.INVALID_COLLECTION);

			console.log(`[OP] ${type} ${query.collection}`);

			if (getOpKind(type) === "collection") {
				const result = await db[type](query.collection);
				return res.r(result);
			}

			if (getOpKind(type) === "index") {
				const result = await db.execute(type as any, query);
				return res.r(result);
			}

			const result = await db[type](query);
			return res.r(result);
		} catch (err: any) {
			console.error(`[DB] ${type} failed: ${err.message}`);
			return res.error(err);
		}
	}

	router.post("/:type", async (req, res) => {
		const result = await dbLogic({
			type: req.params.type,
			query: req.body.query,
		});
		result.ff(res);
	});

	router.post("/:db/:type", async (req, res) => {
		const collection = req.query?.c || "";
		const result = await dbLogic({
			type: req.params.type,
			query: {
				collection,
				...req.body.query,
			},
		});
		result.ff(res);
	});

	return {
		router,
		rootHandler: async (req: any, res: any) => {
			const result = await dbLogic({
				type: req.body.op,
				query: req.body.query,
			});
			result.ff(res);
		},
	};
}
