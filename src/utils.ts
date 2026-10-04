import { ServerInfo } from "./types";

export function parseServerInfo(url: string): ServerInfo {
	const u = new URL(url);
	const id = u.username;
	const password = u.password;
	u.username = "";
	u.password = "";

	const info: ServerInfo = {
		id,
		host: u.toString(),
	};

	if (password) {
		info.redirectHost = decodeURIComponent(password);
		if (!info.redirectHost.startsWith("http"))
			info.redirectHost = "https://" + info.redirectHost;
	}

	return info;
}

export function collectSeeds() {
	const seeds: string[] = [];

	const splitSeeds = (value: string): string[] =>
		value
			.split(" ")
			.map(s => s.trim())
			.filter(Boolean);

	for (const [key, value] of Object.entries(process.env))
		if (key.startsWith("SQUIRREL_SEED_") && value)
			seeds.push(...splitSeeds(value));

	if (process.env.SQUIRREL_SEEDS)
		seeds.push(...splitSeeds(process.env.SQUIRREL_SEEDS));

	return seeds;
}
