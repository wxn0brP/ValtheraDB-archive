import FalconFrame from "@wxn0brp/falcon-frame";
import { Squirrel } from "./squirrel";
import { collectSeeds } from "./utils";

const app = new FalconFrame();
app.setOrigin("*");
app.l(14415);

const squirrel = new Squirrel(
	app,
	{
		name: process.env.SQUIRREL_DB,
		auth: process.env.SQUIRREL_AUTH,
	},
	{
		allowFullScan: process.env.SQUIRREL_ALLOW_FULL_SCAN === "true",
		allowCatchupServer: process.env.SQUIRREL_ALLOW_CATCHUP_SERVER === "true",
		replicationEnabled: process.env.SQUIRREL_REPLICATION_ENABLED === "true",
		replicationFactor: +process.env.SQUIRREL_REPLICATION_FACTOR || 3,
		autoSyncOnStartup: process.env.SQUIRREL_AUTO_SYNC_ON_STARTUP !== "false",
	},
);

squirrel.init(collectSeeds());
