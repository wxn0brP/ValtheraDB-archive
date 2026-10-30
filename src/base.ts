import { errorFromWire } from "@wxn0brp/db-core/errors";
import { serializeFunctions } from "./function";
import { parseRemote } from "./parse";
import { serializeRegex } from "./regex";
import { Remote, RemoteConfig, RequestData } from "./remote";
import { version } from "./version";

export class BaseRemote {
	remote: Remote;
	version = version;

	constructor(remote: string | RemoteConfig) {
		this.remote = parseRemote(remote);
	}

	async _request<T>(type: string, query?: any) {
		const processed = serializeFunctions(query);
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
