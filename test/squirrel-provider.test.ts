import { createMemoryValthera } from "@wxn0brp/db-core";
import { describe, expect, test } from "bun:test";
import { Squirrel } from "../src/squirrel";

function createApp() {
	return {
		use() {
			return this;
		},
		post() {
			return this;
		},
	} as any;
}

describe("Squirrel client provider", () => {
	test("1. getClient creates memory clients through the provider and caches them by host", () => {
		const calls: string[] = [];
		const squirrel = new Squirrel(
			createApp(),
			{
				name: "db",
				auth: "auth",
			},
			{
				allowCatchupServer: true,
				allowFullScan: true,
				replicationEnabled: false,
				replicationFactor: 3,
				autoSyncOnStartup: true,
			},
			host => {
				calls.push(host);
				return createMemoryValthera();
			},
		);

		const first = squirrel.getClient("http://a.local/");
		const second = squirrel.getClient("http://a.local/");
		const third = squirrel.getClient("http://b.local/");

		expect(first).toBe(second);
		expect(third).not.toBe(first);
		expect(calls).toEqual([
			"http://a.local/",
			"http://b.local/",
		]);
	});
});
