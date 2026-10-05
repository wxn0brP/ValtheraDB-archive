import { version as coreVersion } from "@wxn0brp/db-core/version";
// @ts-expect-error package metadata is bundled by Bun
import dirPackage from "@wxn0brp/db-storage-dir/package.json" with {
	type: "json",
};
import { PROTOCOL_VERSION } from "./protocol/types";

export const conduitInfo = {
	name: "ValtheraDB Conduit",
	protocolVersion: PROTOCOL_VERSION,
	coreVersion,
	dirVersion: dirPackage.version,
};
