import { Command } from "commander";
import fs from "fs";
import { loadEnvFile } from "process";
import { generateToken } from "../server/auth/helpers";
import { internalDB } from "../server/init/initDataBases";
import { initKeys } from "../server/init/keys";
import {
	addUserAccess,
	addWolfToken,
	listWolfTokens,
	parsePermission,
	removeUser,
	removeWolfToken,
	resolveRoleId,
	resolveUserId,
	setWolfToken,
	userMgmt,
	wardenMgmt,
} from "./mgmt";

try {
	loadEnvFile();
} catch {}

const program = new Command();
const version = JSON.parse(fs.readFileSync("./package.json", "utf-8")).version;

function printCliError(err: unknown) {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
}

process.on("unhandledRejection", printCliError);
process.on("uncaughtException", printCliError);

program.version(version).description("A CLI tool for managing the database");

const db = program.command("db").description("Manage databases");

db.command("add <name> [folder] [opts]")
	.description("Add a new database")
	.addHelpText(
		"after",
		`
Parameters:
    - opts: JSON string
    `,
	)
	.action(async (name, folder, opts) => {
		const options = opts ? JSON.parse(opts) : {};
		const dbExists = await internalDB.dbs.findOne({
			name,
		});

		if (dbExists) {
			console.log("Database already exists");
			process.exit(1);
		}

		await internalDB.dbs.add(
			{
				name,
				folder: folder || name,
				opts: options,
			},
			false,
		);
		console.log("Done");
		process.exit(0);
	});

db.command("rm <name>")
	.alias("remove")
	.description("Remove a database")
	.action(async name => {
		const res = await internalDB.dbs.removeOne({
			name,
		});
		console.log(res ? "Done" : "Database not found");
		process.exit(0);
	});

db.command("create <dbName> [login] [password] [permissions...]")
	.description("Create a database with a user and assign access")
	.action(async (dbName, login, password, permissions) => {
		const perm = permissions?.length ? permissions.join(" ") : "all";
		if (!login) login = dbName;

		const dbExists = await internalDB.dbs.findOne({
			name: dbName,
		});
		if (dbExists) {
			console.log(`Database "${dbName}" already exists`);
		} else {
			await internalDB.dbs.add(
				{
					name: dbName,
					folder: dbName,
					opts: {},
				},
				false,
			);
			console.log(`Database "${dbName}" created`);
		}

		const userRes = await addUserAccess(login, password || "");
		if (userRes.err) {
			console.log(`User: ${userRes.msg}`);
		} else {
			console.log(`User "${login}" created (id: ${userRes.user._id})`);
		}

		const userId = await resolveUserId(login);

		const roleId = `${dbName}-access`;
		const roleExists = await wardenMgmt.role.exists(roleId);
		if (!roleExists) {
			await wardenMgmt.role.add({
				_id: roleId,
				name: `${dbName} access`,
			});
			console.log(`Role "${roleId}" created`);
		} else {
			console.log(`Role "${roleId}" already exists`);
		}

		const permValue = parsePermission(perm);
		const permExists = await wardenMgmt.rbac.get(roleId, dbName);
		if (!permExists) {
			await wardenMgmt.rbac.add(roleId, dbName, permValue);
			console.log(
				`Permissions "${perm}" (${permValue}) granted on "${dbName}" to role "${roleId}"`,
			);
		} else {
			await wardenMgmt.rbac.update(roleId, dbName, permValue);
			console.log(
				`Permissions "${perm}" (${permValue}) updated on "${dbName}" to role "${roleId}"`,
			);
		}

		await userMgmt.addRoleToUser(userId, roleId);
		console.log(`User "${login}" assigned to role "${roleId}"`);

		console.log("Done");
		process.exit(0);
	});

db.command("list [json]")
	.description("List all databases")
	.action(async json => {
		const dbs = await internalDB.dbs.find();
		if (json) {
			console.log(JSON.stringify(dbs));
			process.exit(0);
		}
		console.table(dbs);
		process.exit(0);
	});

const user = program.command("user").description("Manage users and tokens");

user
	.command("add <login> [password]")
	.description("Add a new user (empty password disables password login)")
	.action(async (login, password) => {
		const res = await addUserAccess(login, password || "");
		console.log(res.err ? res.msg : res.user._id);
		process.exit(0);
	});

user
	.command("rm <login>")
	.alias("remove")
	.description("Remove a user")
	.action(async login => {
		const res = await removeUser(login);
		console.log(res ? "Done" : "User not found");
		process.exit(0);
	});

user
	.command("list")
	.description("List all users")
	.action(async () => {
		const users = await internalDB.user.find();
		const simplifiedUsers = users.map(u => ({
			login: u.login,
			_id: u._id,
		}));
		console.log(simplifiedUsers);
		process.exit(0);
	});

user
	.command("token <user_id_or_login> [time] [match_chars]")
	.description("Get a token for a user")
	.action(async (user_id_or_login, time, match_chars) => {
		const user = await internalDB.findOne<{
			_id: string;
		}>({
			collection: "user",
			search: {
				$or: [
					{
						login: user_id_or_login,
					},
					{
						_id: user_id_or_login,
					},
				],
			},
		});

		if (!user) {
			console.log("User not found");
			process.exit(1);
		}

		await initKeys();

		if (!Number.isNaN(parseInt(time))) time = parseInt(time);
		if (time === "true") time = true;
		if (time === "false") time = false;
		if (typeof time === "undefined" || time === null) time = false;

		const token = await generateToken(
			{
				uid: user._id,
			},
			time,
		);
		console.log(match_chars ? match_chars + token + match_chars : token);
		process.exit(0);
	});

const wolf = user.command("wolf").description("Manage wolf tokens");

wolf
	.command("add <user_id_or_login>")
	.description("Generate a wolf token for a user")
	.action(async user_id_or_login => {
		const result = await addWolfToken(user_id_or_login);
		if (result.err) {
			console.log(result.msg);
			process.exit(1);
		}
		console.log(result.token);
		process.exit(0);
	});

wolf
	.command("set <user_id_or_login> <token>")
	.description("Set a specific wolf token for a user (for multi-server auth)")
	.action(async (user_id_or_login, token) => {
		const result = await setWolfToken(user_id_or_login, token);
		if (result.err) {
			console.log(result.msg);
			process.exit(1);
		}
		console.log(result.token);
		process.exit(0);
	});

wolf
	.command("list [user_id_or_login]")
	.description("List wolf tokens (optionally filtered by user)")
	.action(async user_id_or_login => {
		const tokens = await listWolfTokens(user_id_or_login);
		if (tokens.length === 0) {
			console.log("No wolf tokens found");
			process.exit(0);
		}
		console.table(tokens);
		process.exit(0);
	});

wolf
	.command("rm <token>")
	.alias("remove")
	.description("Remove a wolf token")
	.action(async token => {
		const result = await removeWolfToken(token);
		console.log(result ? "Done" : "Token not found");
		process.exit(0);
	});

const role = program
	.command("role")
	.description("Manage roles and role-based access");

role
	.command("add <role_id> [name]")
	.description("Add a role")
	.action(async (roleId, name) => {
		const role = await wardenMgmt.role.add({
			_id: roleId,
			name: name || roleId,
		});
		console.log(role._id);
		process.exit(0);
	});

role
	.command("rm <role_id_or_name>")
	.alias("remove")
	.description("Remove a role")
	.action(async roleIdOrName => {
		const roleId = await resolveRoleId(roleIdOrName);
		const role = await wardenMgmt.role.remove(roleId);
		console.log(role ? "Done" : "Role not found");
		process.exit(0);
	});

role
	.command("list")
	.description("List all roles")
	.action(async () => {
		console.log(await internalDB.c("roles").find({}));
		process.exit(0);
	});

role
	.command("assign <user_id_or_login> <role_id_or_name>")
	.description("Assign a role to a user")
	.action(async (userIdOrLogin, roleIdOrName) => {
		const userId = await resolveUserId(userIdOrLogin);
		const roleId = await resolveRoleId(roleIdOrName);
		await userMgmt.addRoleToUser(userId, roleId);
		console.log(`Done: ${userId} -> ${roleId}`);
		process.exit(0);
	});

role
	.command("unassign <user_id_or_login> <role_id_or_name>")
	.description("Remove a role from a user")
	.action(async (userIdOrLogin, roleIdOrName) => {
		const userId = await resolveUserId(userIdOrLogin);
		const roleId = await resolveRoleId(roleIdOrName);
		await userMgmt.removeRoleFromUser(userId, roleId);
		console.log(`Done: ${userId} -/-> ${roleId}`);
		process.exit(0);
	});

role
	.command("grant <role_id_or_name> <entity_id> <permissions...>")
	.description("Grant entity access to a role")
	.action(async (roleIdOrName, entityId, permissions) => {
		const roleId = await resolveRoleId(roleIdOrName);
		await wardenMgmt.rbac.add(roleId, entityId, parsePermission(permissions));
		console.log("Done");
		process.exit(0);
	});

role
	.command("revoke <role_id_or_name> <entity_id>")
	.description("Revoke entity access from a role")
	.action(async (roleIdOrName, entityId) => {
		const roleId = await resolveRoleId(roleIdOrName);
		const rule = await wardenMgmt.rbac.remove(roleId, entityId);
		console.log(rule ? "Done" : "Rule not found");
		process.exit(0);
	});

const acl = program.command("acl").description("Manage direct ACL access");

acl
	.command("grant <entity_id> <user_id_or_login> <permissions...>")
	.description("Grant direct ACL access to a user")
	.action(async (entityId, userIdOrLogin, permissions) => {
		const userId = await resolveUserId(userIdOrLogin);
		await wardenMgmt.acl.add(entityId, parsePermission(permissions), userId);
		console.log("Done");
		process.exit(0);
	});

acl
	.command("revoke <entity_id> [user_id_or_login]")
	.description(
		"Revoke direct ACL access from a user, or default ACL access when user is omitted",
	)
	.action(async (entityId, userIdOrLogin) => {
		const userId = userIdOrLogin
			? await resolveUserId(userIdOrLogin)
			: undefined;
		const rule = await wardenMgmt.acl.remove(entityId, userId);
		console.log(rule ? "Done" : "Rule not found");
		process.exit(0);
	});

program
	.command("status")
	.description("Show configuration overview")
	.action(async () => {
		const [dbs, users, gwUsers, tokens, wolfTokens, roles] = await Promise.all([
			internalDB.dbs.find(),
			internalDB.user.find(),
			internalDB.users.find(),
			internalDB.token.find(),
			internalDB.wolf.find(),
			wardenMgmt.role.list(),
		]);

		const roleNameMap = new Map(
			roles.map(r => [
				r._id,
				r.name,
			]),
		);

		console.log("=== STATUS OVERVIEW ===\n");

		if (dbs.length > 0) console.log(`Databases: ${dbs.length}`);
		if (users.length > 0) console.log(`Users: ${users.length}`);
		if (roles.length > 0) console.log(`Roles: ${roles.length}`);
		if (tokens.length > 0) console.log(`JWT Tokens: ${tokens.length}`);
		if (wolfTokens.length > 0) console.log(`Wolf Tokens: ${wolfTokens.length}`);

		console.log("\n--- Databases ---");
		if (dbs.length === 0) {
			console.log("- (none)");
		} else {
			for (const db of dbs) {
				console.log(`- ${db.name}`);
			}
		}

		console.log("\n--- Users ---");
		if (users.length === 0) {
			console.log("- (none)");
		} else {
			for (const user of users) {
				const gwUser = gwUsers.find(g => g._id === user._id);
				const userWolfTokens = wolfTokens.filter(w => w._id === user._id);
				const userTokens = tokens.filter(t => t._id === user._id);

				const roleNames = (gwUser?.roles || [])
					.map(id => roleNameMap.get(id) || id)
					.join(", ");

				console.log(`- ${user.login}`);
				if (roleNames) console.log(`  Roles: ${roleNames}`);
				if (userWolfTokens.length > 0)
					console.log(`  Wolf tokens: ${userWolfTokens.length}`);
				if (userTokens.length > 0)
					console.log(`  JWT tokens: ${userTokens.length}`);
			}
		}

		console.log("\n--- Roles ---");
		if (roles.length === 0) {
			console.log("- (none)");
		} else {
			for (const role of roles) {
				const rbacRules = await wardenMgmt.rbac.list(role._id);
				console.log(`- ${role.name}`);
				if (rbacRules.length > 0) {
					console.log("  Permissions:");
					for (const rule of rbacRules) {
						console.log(`    - ${rule._id}: ${rule.p}`);
					}
				}
			}
		}
		process.exit(0);
	});

program.parse(process.argv);
