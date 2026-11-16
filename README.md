# ValtheraDB Mirror

Single repo mirroring the whole ValtheraDB ecosystem. Every `wxn0brP/ValtheraDB*` project lives here as one branch, so the whole ecosystem fits in a single `git clone`.

## How it works

`.github/workflows/archive.yml` runs daily (03:00 UTC, or manually) and for every source repo: fetches its default branch, rewrites it as `<repo-name>` branch here, records `Source-commit: <sha>` in the sync commit, skips repos without new commits, then force-pushes. Workflows are stripped, so clones never run the source CI.

## Usage

```sh
git clone https://github.com/wxn0brP/ValtheraDB-archive.git
git branch -r                  # every mirrored repo is a branch
git switch ValtheraDB-core     # work on one project
git fetch origin --prune       # pull updates for all
```

Branch name always equals the source repo name. Tip commit of a branch shows what it was synced from:

```sh
git log -1 --format=%B origin/ValtheraDB-core
```

Branches are at most one day behind their sources.
