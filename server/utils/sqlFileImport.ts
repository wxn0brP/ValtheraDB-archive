const unsupportedCommands = [
	"CREATE DATABASE",
	"USE",
];

class SQLFileParser {
	/**
	 * Main method parsing SQL file and returning an array of SQL queries.
	 * @param sqlContent - Content of the SQL file as a string.
	 * @returns An array of SQL queries processed for the engine.
	 */
	parse(sqlContent: string): string[] {
		const queries = this.splitQueries(sqlContent);
		const filteredQueries = this.filterUnsupportedQueries(queries);
		const processedQueries = this.processInserts(filteredQueries);

		return processedQueries;
	}

	/**
	 * Removes comments from SQL code.
	 * Supports both single-line comments (--), and multi-line comments (\/\* ... \*\/).
	 * @param sqlContent - Content of the SQL file.
	 * @returns Content of the SQL file without comments.
	 */
	/**
	 * Splits the SQL content into individual queries.
	 * Assumes that queries are separated by semicolons (;).
	 * @param sqlContent - Content of the SQL file.
	 * @returns An array of SQL queries.
	 */
	private splitQueries(sqlContent: string): string[] {
		const queries: string[] = [];
		let current = "";
		let quote = "";
		for (let i = 0; i < sqlContent.length; i++) {
			const ch = sqlContent[i];
			const next = sqlContent[i + 1];
			if (quote) {
				current += ch;
				if (ch === "\\" && next) current += sqlContent[++i];
				else if (ch === quote && next === quote) current += sqlContent[++i];
				else if (ch === quote) quote = "";
				continue;
			}
			if (ch === "'" || ch === '"' || ch === "`") {
				quote = ch;
				current += ch;
			} else if (ch === "-" && next === "-") {
				while (i < sqlContent.length && sqlContent[i] !== "\n") i++;
				current += "\n";
			} else if (ch === "/" && next === "*") {
				i += 2;
				while (
					i < sqlContent.length &&
					!(sqlContent[i] === "*" && sqlContent[i + 1] === "/")
				)
					i++;
				if (i >= sqlContent.length)
					throw new Error("SQL: unterminated comment");
				i++;
				current += " ";
			} else if (ch === ";") {
				if (current.trim()) queries.push(current.trim());
				current = "";
			} else current += ch;
		}
		if (quote) throw new Error("SQL: unterminated quoted value");
		if (current.trim()) queries.push(current.trim());
		return queries;
	}

	/**
	 * Filters out unsupported queries like CREATE DATABASE and USE.
	 * @param queries - An array of SQL queries.
	 * @returns An array of supported SQL queries.
	 */
	private filterUnsupportedQueries(queries: string[]): string[] {
		return queries.filter(query => {
			const upperQuery = query.toUpperCase();
			return !unsupportedCommands.some(cmd => upperQuery.startsWith(cmd));
		});
	}

	/**
	 * Extracts value tuples from the VALUES part of an INSERT statement.
	 * This method correctly handles parentheses within string literals.
	 * @param valuesPart The part of the SQL query that contains the values.
	 * @returns An array of value tuple strings.
	 */
	private extractValues(valuesPart: string): string[] {
		const values: string[] = [];
		let parenLevel = 0;
		let inString = false;
		let quoteChar: "'" | '"' | "" = "";
		let startIndex = -1;

		for (let i = 0; i < valuesPart.length; i++) {
			const char = valuesPart[i];
			const lastChar = i > 0 ? valuesPart[i - 1] : "";

			if (inString) {
				if (char === "\\" && i + 1 < valuesPart.length) {
					i++;
				} else if (char === quoteChar && valuesPart[i + 1] === quoteChar) {
					i++;
				} else if (char === quoteChar && lastChar !== "\\") {
					inString = false;
				}
			} else {
				if (char === "'" || char === '"') {
					inString = true;
					quoteChar = char;
				} else if (char === "(") {
					if (parenLevel === 0) {
						startIndex = i;
					}
					parenLevel++;
				} else if (char === ")") {
					parenLevel--;
					if (parenLevel === 0 && startIndex !== -1) {
						values.push(valuesPart.substring(startIndex, i + 1));
						startIndex = -1;
					}
				}
			}
		}
		return values;
	}

	/**
	 * Processes INSERT queries with multiple values into single INSERTs.
	 * @param queries - An array of SQL queries.
	 * @returns An array of processed SQL queries.
	 */
	private processInserts(queries: string[]): string[] {
		const processedQueries: string[] = [];

		for (const query of queries) {
			if (query.toUpperCase().startsWith("INSERT")) {
				const valuesIndex = query.toUpperCase().indexOf("VALUES");
				if (valuesIndex === -1) {
					// Not an INSERT ... VALUES query, e.g. INSERT ... SELECT
					processedQueries.push(query);
					continue;
				}

				const insertPart = query.substring(0, valuesIndex);
				const valuesPart = query.substring(valuesIndex + "VALUES".length);

				const valuesMatch = this.extractValues(valuesPart);

				if (valuesMatch.length === 0) {
					// This can happen for INSERT ... SELECT, or malformed queries.
					// Push the original query and let the DB engine handle it.
					processedQueries.push(query);
					continue;
				}

				// For each value, create a separate INSERT query
				for (const value of valuesMatch) {
					processedQueries.push(`${insertPart.trim()} VALUES ${value}`);
				}
			} else {
				// If it's not an INSERT query, add it without changes
				processedQueries.push(query);
			}
		}

		return processedQueries;
	}
}

const sqlSplitter = new SQLFileParser();
export default sqlSplitter;
