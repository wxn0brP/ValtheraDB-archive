import { Entry } from "./types";

export const OP_ORDER_SMALL = [
	"add-small",
	"findOne-small",
	"find-search-small",
	"find-paginated-small",
	"updateOne-small",
	"update-search-small",
	"removeOne-small",
	"remove-search-small",
	"find-small",
	"update-small",
	"remove-small",
];

export const OP_ORDER_LARGE = [
	"add-large",
	"findOne-large",
	"find-search-large",
	"find-paginated-large",
	"updateOne-large",
	"update-search-large",
	"removeOne-large",
	"remove-search-large",
];

export const state = {
	entries: [] as Entry[],
	adapterConfig: {} as Record<string, string>,
};
