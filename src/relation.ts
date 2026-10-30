import { RelationTypes } from "@wxn0brp/db-core";
import { Search } from "@wxn0brp/db-core/types/arg";
import { DbFindOpts } from "@wxn0brp/db-core/types/options";
import { parseRemote } from "./parse";
import { serializeRegex } from "./regex";
import { RemoteConfig, Remote } from "./remote";

export class RelationClient {
	remote: Record<string, Remote> = {};

	constructor(remote: Record<string, string | RemoteConfig>) {
		this.remote = Object.fromEntries(
			Object.entries(remote).map(([name, remote]) => [
				name,
				parseRemote(remote),
			]),
		);
	}

	async _request(type: "findOne" | "find", params: any[]) {
		const dbName = params[0][0];
		const entry = this.remote[dbName];
		const url = new URL(entry.url);

		const config: Record<string, string> = {};
		Object.entries(this.remote).forEach(([name, remote]) => {
			config[name] = remote.url.toString();
		});

		if (typeof params[1] === "function") params[1] = params[1].toString();
		else if (params[1] && typeof params[1] === "object")
			params[1] = serializeRegex(params[1]);

		url.pathname = url.pathname + "/r/" + type;
		const body = {
			accessCfg: config,
			params: params,
			auth: url.username,
		};

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(entry.headers || {}),
			},
			body: JSON.stringify(body),
			...(entry.fetch || {}),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`HTTP ${response.status}: ${text}`);
		}

		const data = (await response.json()) as {
			err: boolean;
			msg: string;
			result: any;
		};
		if (data.err)
			throw new Error(data.msg || "Unknown error from relation API");

		return data.result;
	}

	async find(
		path: RelationTypes.Path,
		search: Search,
		relations: RelationTypes.Relation,
		select?: string[][] | Record<string, any>,
		dbFindOpts: DbFindOpts = {},
	): Promise<any[]> {
		return await this._request("find", [
			path,
			search,
			relations,
			select,
			dbFindOpts,
		]);
	}

	async findOne(
		path: RelationTypes.Path,
		search: Search,
		relations: RelationTypes.Relation,
		select?: string[][] | Record<string, any>,
	): Promise<any> {
		return await this._request("findOne", [
			path,
			search,
			relations,
			select,
		]);
	}
}
