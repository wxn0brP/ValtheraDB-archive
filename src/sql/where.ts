// It’s cheap - it’s cheap
// It’s good - it’s cheap

import { assertSafeFieldPath, isUnsafeKey, lastPathPart } from "#sql/utils";

type QueryObject = Record<string, any>;

const operators: Record<string, string> = {
	"=": null,
	"<": "$lt",
	">": "$gt",
	"<=": "$lte",
	">=": "$gte",
	"!=": "$not",
	"<>": "$not",
	IN: "$in",
	"NOT IN": "$nin",
	"NOT ANY": "$nin",
	IS: null,
	"IS NOT": "$not",
};

function escapeRegex(string: string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function likeToRegex(pattern: string, caseInsensitive: boolean = false) {
	const escaped = escapeRegex(pattern);
	const converted = escaped.replace(/%/g, ".*").replace(/_/g, ".");
	return new RegExp(`^${converted}$`, caseInsensitive ? "i" : "");
}

function mergeQueries(target: QueryObject, source: QueryObject) {
	for (const [key, value] of Object.entries(source)) {
		if (isUnsafeKey(key)) continue;
		// If the key is an operator, simply add it
		if (key.startsWith("$")) {
			target[key] = value;
			continue;
		}
		// If the key is a field and both sides are objects, merge them
		const existing = target[key];
		if (
			existing !== undefined &&
			typeof existing === "object" &&
			existing !== null &&
			!Array.isArray(existing)
		) {
			Object.assign(existing, value);
		} else {
			target[key] = value;
		}
	}
}

export function parseWhere(where: string): QueryObject {
	if (!where) return {};
	const trimmed = where.trim();
	if (trimmed === "" || trimmed === "1") return {};

	// Tokenize the input string, handling parentheses and quoted values
	const quotedPath = '(?:"[^"]*"|`[^`]*`)(?:\\.(?:"[^"]*"|`[^`]*`|[\\w]+))*';
	const tokens =
		where
			.replace(/\s+(?=(?:[^'"`]*['"`][^'"`]*['"`])*[^'"`]*$)/g, " ")
			.match(
				new RegExp(
					`(?:\\(|\\)|'(?:[^'\\\\]|\\\\.)*'|${quotedPath}|>=|<=|!=|<>|=|<|>|[^\\s()=<>!]+)`,
					"g",
				),
			) || [];

	const frames: Array<{
		current: QueryObject;
		operatorStack: string[];
		stack: any[];
	}> = [];
	let current: QueryObject = {};
	let operatorStack: string[] = [];
	let stack: any[] = [];

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i].trim();
		if (!token) continue;

		if (token === "(") {
			// Push current context to the stack and reset for the new group
			frames.push({
				current,
				operatorStack,
				stack,
			});
			current = {};
			operatorStack = [];
			stack = [];
		} else if (token === ")") {
			// Combine current and stack into a grouped query
			let groupedQuery: QueryObject = current;
			if (stack.length > 0) {
				stack.push(current);
				groupedQuery = {
					$or: stack,
				};
			}

			if (frames.length === 0) {
				throw new Error("Unmatched closing parenthesis");
			}
			const parentFrame = frames.pop()!;
			const parentCurrent = parentFrame.current;
			const parentOperatorStack = parentFrame.operatorStack;
			const parentStack = parentFrame.stack;

			// Merge the grouped query into the parent context
			if (parentOperatorStack.length > 0) {
				const op = parentOperatorStack.pop();
				if (op === "OR") {
					parentStack.push(parentCurrent);
					current = groupedQuery;
				} else if (op === "AND") {
					const newCurrent: QueryObject = {};
					mergeQueries(newCurrent, parentCurrent);
					mergeQueries(newCurrent, groupedQuery);
					current = newCurrent;
				}
			} else {
				const newCurrent: QueryObject = {};
				mergeQueries(newCurrent, parentCurrent);
				mergeQueries(newCurrent, groupedQuery);
				current = newCurrent;
			}

			// Restore parent's stack and operator stack
			operatorStack = parentFrame.operatorStack;
			stack = parentFrame.stack;
		} else if (token.toUpperCase() === "AND" || token.toUpperCase() === "OR") {
			operatorStack.push(token.toUpperCase());
		} else {
			// Process condition (key, operator, value)
			if (operatorStack.length) {
				const op = operatorStack[operatorStack.length - 1];
				if (op === "OR") {
					stack.push(current);
					current = {};
					operatorStack.pop();
				}
			}

			const key = lastPathPart(token);
			assertSafeFieldPath(token, "WHERE field");
			let opToken = tokens[++i]?.trim();
			// Handle multi-word operators
			if (opToken) {
				const upperOp = opToken.toUpperCase();
				const nextToken = tokens[i + 1]?.trim().toUpperCase();

				if (
					upperOp === "NOT" &&
					[
						"IN",
						"LIKE",
						"ILIKE",
						"ANY",
						"BETWEEN",
					].includes(nextToken)
				) {
					opToken = `NOT ${nextToken}`;
					i++;
				} else if (upperOp === "IS") {
					if (nextToken === "NOT") {
						opToken = "IS NOT";
						i++;
						// Check for NULL
						if (tokens[i + 1]?.trim().toUpperCase() === "NULL") {
							// Correctly consume NULL as value
						}
					}
				}
			}

			let value: any = tokens[++i]?.trim();

			if (!key || !opToken || value === undefined) {
				throw new Error(formatConditionError(key, opToken, value));
			}

			if (isOperatorToken(value)) {
				throw new Error(
					`Invalid value for WHERE key '${key}' near '${key} ${opToken} ${value}'`,
				);
			}

			// Handle quoted values
			if (
				typeof value === "string" &&
				((value.startsWith("'") && value.endsWith("'")) ||
					(value.startsWith('"') && value.endsWith('"')))
			) {
				value = value.slice(1, -1);
			}

			// Handle NULL value
			if (typeof value === "string" && value.toUpperCase() === "NULL") {
				value = null;
			}

			// Parse numeric values
			if (value !== null && !Number.isNaN(Number(value))) {
				value = Number(value);
			}

			// Handle IN, NOT IN, NOT ANY operations
			if (
				opToken.toUpperCase() === "IN" ||
				opToken.toUpperCase() === "NOT IN" ||
				opToken.toUpperCase() === "NOT ANY"
			) {
				// If the value is just "(", we need to consume tokens until we find the closing ")"
				if (value === "(") {
					let collected = "(";
					while (i < tokens.length - 1) {
						const next = tokens[++i];
						collected += next;
						if (next === ")") break;
					}
					value = collected;
				}

				if (!value.startsWith("(") || !value.endsWith(")")) {
					throw new Error(`Invalid syntax for '${opToken}' near '${value}'`);
				}
				value = value
					.slice(1, -1)
					.split(",")
					.map((v: string) => {
						v = v.trim();
						if (
							(v.startsWith("'") && v.endsWith("'")) ||
							(v.startsWith('"') && v.endsWith('"'))
						) {
							return v.slice(1, -1);
						}
						return Number.isNaN(Number(v)) ? v : Number(v);
					});
			}

			// Handle LIKE/NOT LIKE/ILIKE/NOT ILIKE specially to convert to regex
			if (
				opToken.toUpperCase() === "LIKE" ||
				opToken.toUpperCase() === "NOT LIKE" ||
				opToken.toUpperCase() === "ILIKE" ||
				opToken.toUpperCase() === "NOT ILIKE"
			) {
				if (typeof value !== "string") {
					throw new Error(`LIKE value must be a string, got ${value}`);
				}
				const isCaseInsensitive = opToken.toUpperCase().includes("ILIKE");
				const regex = likeToRegex(value, isCaseInsensitive);
				const isNot = opToken.toUpperCase().startsWith("NOT");

				if (isNot) {
					// NOT LIKE -> {$not: {$regex: {key: regex}}}
					if (!current["$not"]) current["$not"] = {};
					if (!current["$not"]["$regex"]) current["$not"]["$regex"] = {};
					current["$not"]["$regex"][key] = regex;
				} else {
					// LIKE -> {$regex: {key: regex}}
					if (!current["$regex"]) current["$regex"] = {};
					current["$regex"][key] = regex;
				}
				continue; // processing done for this token
			}

			// Handle BETWEEN/NOT BETWEEN
			if (
				opToken.toUpperCase() === "BETWEEN" ||
				opToken.toUpperCase() === "NOT BETWEEN"
			) {
				const andToken = tokens[++i]?.trim();
				if (!andToken || andToken.toUpperCase() !== "AND") {
					throw new Error("BETWEEN expects AND, got " + andToken);
				}
				let val2: any = tokens[++i]?.trim();

				// Handle quoted values for val2
				if (
					typeof val2 === "string" &&
					((val2.startsWith("'") && val2.endsWith("'")) ||
						(val2.startsWith('"') && val2.endsWith('"')))
				) {
					val2 = val2.slice(1, -1);
				}
				// Handle numerics for val2
				if (val2 !== null && !Number.isNaN(Number(val2))) {
					val2 = Number(val2);
				}

				if (opToken.toUpperCase() === "NOT BETWEEN") {
					if (!current["$not"]) current["$not"] = {};
					if (!current["$not"]["$between"]) current["$not"]["$between"] = {};
					current["$not"]["$between"][key] = [
						value,
						val2,
					];
				} else {
					// BETWEEN -> {$between: {key: [val1, val2]}}
					if (!current["$between"]) current["$between"] = {};
					current["$between"][key] = [
						value,
						val2,
					];
				}
				continue;
			}

			// Map the operator to the query operators
			const mappedOp = operators[opToken.toUpperCase()];

			if (mappedOp !== undefined) {
				if (mappedOp === null) {
					// "=" operator - direct assignment
					current[key] = value;
				} else {
					// Other operators - they go to the root level
					if (!current[mappedOp]) {
						current[mappedOp] = {};
					}
					(current[mappedOp] as Record<string, any>)[key] = value;
				}
			} else {
				throw new Error(
					`Unsupported WHERE operator '${opToken}' for key '${key}'`,
				);
			}
		}
	}

	if (frames.length > 0) {
		throw new Error("Unmatched opening parenthesis in WHERE clause");
	}

	const lastToken = tokens[tokens.length - 1]?.toUpperCase();
	if (lastToken === "AND" || lastToken === "OR") {
		throw new Error(`Dangling WHERE operator '${lastToken}'`);
	}

	// Combine any remaining OR conditions
	if (stack.length > 0) {
		stack.push(current);
		return {
			$or: stack,
		};
	}

	return current;
}

function isOperatorToken(value: any) {
	return typeof value === "string" && /^(=|!=|<>|<|>|<=|>=)$/i.test(value);
}

function formatConditionError(key?: string, opToken?: string, value?: any) {
	const parts = [
		key,
		opToken,
		value,
	]
		.filter(v => v !== undefined && v !== "")
		.join(" ");

	if (!key) return "Invalid WHERE condition: missing key";
	if (!opToken)
		return `Invalid WHERE condition for key '${key}': missing operator`;
	if (value === undefined)
		return `Invalid WHERE condition for key '${key}': missing value near '${parts}'`;

	return `Invalid WHERE condition near '${parts}'`;
}
