const dir = process.cwd() + "/";
export async function _log(level: number, ...data: any[]) {
	const logLevel = parseInt(process.env.VDB_BIN_LOG_LEVEL || "0", 10);
	if (logLevel < level) return;

	const line = new Error().stack.split("\n")[2].trim();
	let path = line
		.slice(line.indexOf("("))
		.replace(dir, "")
		.replace("(", "")
		.replace(")", "");
	const at = line.slice(3, line.indexOf("(") - 1);

	if (path.length < 2) path = line.replace(dir, "").replace("at ", ""); // if path is 2 (callback):

	console.log(
		`[${level}] ` + "\x1b[36m" + path + ":",
		"\x1b[33m" + at + "\x1b[0m",
		...data,
	);
}
