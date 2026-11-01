export interface RemoteOptions {
	headers?: Record<string, string>;
	fetch?: Record<string, any>;
	body?: Record<string, any>;
}

export interface RemoteConfig extends RemoteOptions {
	name: string;
	url: string;
	auth: string;
	query?: Record<string, string>;
}

export interface Remote extends RemoteOptions {
	url: URL;
}

export interface RequestData {
	auth?: string;
	db?: string;
	keys?: string[][];
	undefinedPaths?: string[][];
	query?: Record<string, any>;
}
