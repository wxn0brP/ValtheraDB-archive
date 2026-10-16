export const squirrelTimeKey = "_squirrel";

export const COLLECTIONS = {
	SQUIRREL: "__squirrel",
	SQUIRREL_CATCHUP: "__squirrel_catchup",
};

export const COLLECTION_OPS = new Set([
	"getCollections",
	"capabilities",
	"ensureCollection",
	"issetCollection",
	"removeCollection",
]);

export const NO_QUERY_OPS = new Set([
	"getCollections",
	"capabilities",
]);

export const TIMEOUTS = {
	SERVER_CHECK: 1500,
};

export const HTTP_STATUS = {
	MULTI_STATUS: 207,
	TEMPORARY_REDIRECT: 307,
};
