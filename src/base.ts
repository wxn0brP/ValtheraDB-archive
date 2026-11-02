import { errorFromWire } from "@wxn0brp/db-core/errors";
import { VQueryT } from "@wxn0brp/db-core/types/query";
import { updateFindObject } from "@wxn0brp/db-core/utils/updateFindObject";
import { serializeFunctions } from "./function";
import { parseRemote } from "./parse";
import { serializeRegex } from "./regex";
import { Remote, RemoteConfig, RequestData } from "./remote";
import { findUndefinedPaths } from "./undefined";
import { version } from "./version";

export class BaseRemote {
	remote: Remote;
	version = version;

	constructor(remote: string | RemoteConfig) {
		this.remote = parseRemote(remote);
	}

	async _find<T = any>(query: VQueryT.Find<T>): Promise<T[]> {
		const findOpts = query.findOpts;

		if (typeof findOpts?.transform !== "function")
			return this._request<T[]>("find", query);

		const remoteQuery = {
			...query,
			findOpts: {},
		};
		const docs = await this._request<T[]>("find", remoteQuery);

		return docs.map(doc => updateFindObject(doc, findOpts)) as T[];
	}

	async _findOne<T = any>(query: VQueryT.FindOne<T>): Promise<T | null> {
		const findOpts = query.findOpts;

		if (typeof findOpts?.transform !== "function")
			return this._request<T | null>("findOne", query);

		const remoteQuery = {
			...query,
			findOpts: {},
		};
		const doc = await this._request<T | null>("findOne", remoteQuery);
		if (!doc) return null;

		return updateFindObject(doc, findOpts) as T | null;
	}

	async _request<T>(type: string, query?: any) {
		const processed = serializeFunctions(query);
		const undefinedPaths = findUndefinedPaths(query);
		const url = new URL(this.remote.url);

		const payload = processed.data;
		const data: RequestData = {
			db: url.username,
			auth: url.password,
			query: payload?.search
				? {
						...payload,
						search: serializeRegex(payload.search),
					}
				: payload,
			keys: processed.keys,
			undefinedPaths,
			...(this.remote.body || {}),
		};

		url.pathname = url.pathname.replace(/\/$/, "") + "/db/" + type;
		url.username = "";
		url.password = "";

		const res = (await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(this.remote.headers || {}),
			},
			body: JSON.stringify(data),
			...(this.remote.fetch || {}),
		}).then(res => res.json())) as {
			err: boolean;
			msg: string;
			result: any;
			code?: string;
			suggestion?: string;
			context?: Record<string, unknown>;
		};

		if (res.err)
			throw errorFromWire({
				code: res.code,
				message: res.msg,
				suggestion: res.suggestion,
				context: res.context,
			});
		return res.result as T;
	}
}
