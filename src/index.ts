import {
	AdapterCloseError,
	AdapterInitError,
	isValtheraError,
} from "@wxn0brp/db-core/errors";
import { GitSnapshotActions } from "./file";
import { DebounceFlusher } from "./flusher";
import { GitManager } from "./git";
import type { GitAdapterOpts } from "./types";

export async function createGit(opts: GitAdapterOpts) {
	const { dir, git, flusher } = opts;

	const adapter = new GitSnapshotActions(dir, opts.dirOpts ?? {});
	const gitManager = new GitManager(git, dir);

	await adapter.init();
	try {
		await gitManager.clone();
		await gitManager.pull();
	} catch (err) {
		if (isValtheraError(err)) throw err;
		throw new AdapterInitError(err, {
			dir,
			url: git.url,
			branch: git.branch,
		});
	}

	const flusherOpts = {
		delay: flusher?.delay ?? 10000,
		autoFlush: flusher?.autoFlush ?? true,
	};

	const debounceFlusher = new DebounceFlusher(flusherOpts, gitManager);

	const originalRemoveCollection = adapter.removeCollection.bind(adapter);
	adapter.removeCollection = async (collection: string) => {
		const result = await originalRemoveCollection(collection);
		debounceFlusher.trigger();
		return result;
	};

	const originalClose = adapter.close.bind(adapter);
	adapter.close = async () => {
		if (interval) clearInterval(interval);
		try {
			await debounceFlusher.flush();
		} catch (err) {
			throw new AdapterCloseError(err, {
				dir,
				branch: git.branch,
			});
		}
		await originalClose();
	};

	let interval: ReturnType<typeof setInterval> = null;
	if (flusherOpts.autoFlush) {
		interval = setInterval(() => {
			debounceFlusher.trigger();
		}, flusherOpts.delay);
	}

	return {
		adapter,
		gitManager,
		debounceFlusher,
	};
}

export async function createGitAdapter(opts: GitAdapterOpts) {
	const { adapter } = await createGit(opts);
	return adapter;
}

export const DYNAMIC = {
	git: createGitAdapter,
};
