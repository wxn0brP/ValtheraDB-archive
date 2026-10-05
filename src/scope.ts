// @ts-ignore
import { DbDirOpts } from "@wxn0brp/db-storage-dir/types";
// @ts-ignore
import { Options as BinOpts } from "@wxn0brp/db-storage-bin";
// @ts-ignore
import { MongoClientOptions } from "mongodb";
// @ts-ignore
import { RocksOpenOptions } from "@wxn0brp/db-storage-rocks/types";
// @ts-ignore
import { EncryptedActionOptions } from "@wxn0brp/db-storage-crypt/crypto";
// @ts-ignore
import { RemoteConfig } from "@wxn0brp/db-client/remote";
// @ts-ignore
import { Opts as LengthOpts } from "@wxn0brp/db-storage-length/action";
// @ts-ignore
import { IndexConfig, DirIndexOpts } from "@wxn0brp/db-storage-dir-index/types";
// @ts-ignore
import { GitAdapterOpts } from "@wxn0brp/db-storage-git/types";
// @ts-ignore
import { Opts as XlsxOpts } from "@wxn0brp/db-storage-xlsx/action";

export interface ScopeBase {
	dir(folder: string, opts?: DbDirOpts): any;
	bin(path: string, opts?: Partial<BinOpts>): any;
	sqlite: {
		(file: string, keys?: Record<string, string>, opts?: any): any;
		bun(file: string, keys?: Record<string, string>, opts?: any): any;
		node(file: string, keys?: Record<string, string>, opts?: any): any;
		better(file: string, keys?: Record<string, string>, opts?: any): any;
	};
	mongodb(uri: string, dbName: string, opts?: MongoClientOptions): any;
	rocks(location: string, opts?: RocksOpenOptions): any;
	crypt(folder: string, options?: EncryptedActionOptions): any;
	client(url: string | RemoteConfig): any;
	accdb(file: string, keys?: Record<string, string>): any;
	length(opts: LengthOpts): any;
	"dir-index"(
		dir: string,
		indexConfig?: IndexConfig,
		dirConfig?: DirIndexOpts,
	): any;
	git(opts: GitAdapterOpts): any;
	xlsx(opts: XlsxOpts): any;
}
