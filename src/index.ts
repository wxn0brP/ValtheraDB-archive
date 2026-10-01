import { EncryptedAction, EncryptedActionOptions } from "./crypto";

export * from "./crypto";
export * from "./key";

export const DYNAMIC = {
	crypt: async (folder: string, options: EncryptedActionOptions) => {
		return new EncryptedAction(folder, options);
	},
};
