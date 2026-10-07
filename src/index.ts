import { db } from "./db";
import { benchmarkLarge } from "./large";
import { type BenchResult } from "./run";
import { benchmarkSmall } from "./small";
import { loadCustomSetup, writeResults } from "./utils";

const adapterName = process.env.VALTHERA_MASTER || "";

const [pkg] = adapterName.split(":");
const onAfterAdd = await loadCustomSetup(pkg, db.adapter);

const allResults: BenchResult[] = [];

console.log("small collection (users, 10k)");
const smallResults = await benchmarkSmall(db.c("users"));
allResults.push(...smallResults);

console.log("large collection (posts, 200k)");
const largeResults = await benchmarkLarge(db.c("posts"), onAfterAdd);
allResults.push(...largeResults);

writeResults("result.json", {
	results: allResults,
	adapter: process.env.VALTHERA_MASTER || "N/A",
	coreVersion: db.version,
	adapterVersion: db.adapter?.version || "N/A",
});

await db.close();

setTimeout(() => process.exit(0), 3000).unref(); // exit force after 3 seconds
