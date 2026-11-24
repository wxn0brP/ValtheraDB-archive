import { RemoteActionsBase } from "./adapter";
import { RemoteConfig } from "./remote";

export * from "./adapter";
export * from "./regex";
export * from "./remote";
export * from "./undefined";
export * from "./valthera";

export const DYNAMIC = {
	def(url: string | RemoteConfig) {
		return new RemoteActionsBase(url);
	},
};
