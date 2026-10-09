import { makeConnect, AccDBValthera } from "../src/index.js";
import { unlink } from "fs/promises";

const TEST_FILE = `./valthera-e2e-test.accdb`;

export const TABLES = [
	`CREATE TABLE users (
        _id TEXT PRIMARY KEY,
        name TEXT,
        age INTEGER
    )`,
	`CREATE TABLE test (
        _id TEXT PRIMARY KEY,
        name TEXT
    )`,
	`CREATE TABLE items (
        _id TEXT PRIMARY KEY,
        name TEXT,
        val INTEGER,
        status TEXT,
        extra INTEGER,
        a,
        b INTEGER,
        c INTEGER,
        count INTEGER,
        temp TEXT,
        tags,
        settings,
        text TEXT
    )`,
];

export default async () => {
	await unlink(TEST_FILE).catch(() => {});
	const conn = await makeConnect(TEST_FILE);
	const actions = new AccDBValthera(conn);
	await actions.init();

	for (const sql of TABLES) await conn.query(sql);

	return actions;
};
