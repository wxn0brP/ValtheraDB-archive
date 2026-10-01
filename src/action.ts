import { CustomFileCpu } from "@wxn0brp/db-core";
import { CustomActionsBase } from "@wxn0brp/db-core/base/custom";
import ExcelJS from "exceljs";
import { access, mkdir, readdir, rm } from "fs/promises";

export interface Opts {
	file?: string;
	dir?: string;
}

/** U+2400 */
export const NULL_VALUE = "␀";

export class DbStorageXlsx extends CustomActionsBase {
	constructor(public opts: Opts) {
		super();
		this.fileCpu = new CustomFileCpu(
			this.read.bind(this),
			this.write.bind(this),
		);
	}

	_getPath(collection: string) {
		if (this.opts.file) {
			return this.opts.file;
		} else if (this.opts.dir) {
			return this.opts.dir + "/" + collection + ".xlsx";
		}
		return "";
	}

	_getSheetName(collection: string) {
		return collection;
	}

	async read(file: string) {
		const path = this._getPath(file);
		try {
			await access(path);
		} catch {
			return [];
		}

		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.readFile(path);

		const sheetName = this._getSheetName(file);
		const sheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
		if (!sheet || sheet.rowCount < 2) return [];

		const headers: string[] = [];
		const headerRow = sheet.getRow(1);
		const cellCount = headerRow.cellCount;
		for (let col = 1; col <= cellCount; col++) {
			const val = headerRow.getCell(col).value;
			headers.push(val != null ? String(val) : "");
		}

		const data: Record<string, any>[] = [];
		for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
			const row = sheet.getRow(rowNum);
			const obj: Record<string, any> = {};
			let hasValue = false;

			for (let idx = 0; idx < headers.length; idx++) {
				const header = headers[idx];
				if (!header) continue;
				const cell = row.getCell(idx + 1);
				const val = cell.value;

				const cellHasContent = cell.type !== ExcelJS.ValueType.Null;
				if (cellHasContent) hasValue = true;

				if (val !== undefined && val !== null) {
					if (val === NULL_VALUE) {
						obj[header] = null;
					} else if (
						typeof val === "string" &&
						(val.startsWith("{") || val.startsWith("["))
					) {
						try {
							obj[header] = JSON.parse(val);
						} catch {
							obj[header] = val;
						}
					} else {
						obj[header] = val;
					}
				} else if (cellHasContent) {
					obj[header] = null;
				}
			}

			if (hasValue) data.push(obj);
		}

		return data;
	}

	async write(file: string, data: any[]) {
		const path = this._getPath(file);
		let workbook = new ExcelJS.Workbook();
		const sheetName = this._getSheetName(file);

		if (this.opts.file) {
			try {
				await access(path);
				await workbook.xlsx.readFile(path);
			} catch {
				workbook = new ExcelJS.Workbook();
			}
			const existing = workbook.getWorksheet(sheetName);
			if (existing) {
				workbook.removeWorksheet(existing.id);
			}
		}

		const allKeys = new Set<string>();
		const rows: Record<string, any>[] = [];

		for (const row of data) {
			const mappedRow: Record<string, any> = {};
			for (const key of Object.keys(row)) {
				allKeys.add(key);
				const val = row[key];
				if (val === null) {
					mappedRow[key] = NULL_VALUE;
				} else if (typeof val === "object") {
					mappedRow[key] = JSON.stringify(val);
				} else {
					mappedRow[key] = val;
				}
			}
			rows.push(mappedRow);
		}

		const headers = [
			...allKeys,
		];
		const sheet = workbook.addWorksheet(sheetName);
		sheet.columns = headers.map(key => ({
			header: key,
			key,
		}));
		for (const row of rows) {
			sheet.addRow(row);
		}

		await workbook.xlsx.writeFile(path);
	}

	async ensureCollection(collection: string) {
		const path = this._getPath(collection);
		if (this.opts.file) {
			try {
				await access(path);
				return false;
			} catch {
				const workbook = new ExcelJS.Workbook();
				workbook.addWorksheet(collection);
				await workbook.xlsx.writeFile(path);
			}
		} else if (this.opts.dir) {
			try {
				await access(path);
				return false;
			} catch {
				await mkdir(this.opts.dir, {
					recursive: true,
				});
				const workbook = new ExcelJS.Workbook();
				workbook.addWorksheet(collection);
				await workbook.xlsx.writeFile(path);
			}
		}
		return true;
	}

	async issetCollection(collection: string): Promise<boolean> {
		const path = this._getPath(collection);
		if (this.opts.file) {
			try {
				await access(path);
				const workbook = new ExcelJS.Workbook();
				await workbook.xlsx.readFile(path);
				const sheetName = this._getSheetName(collection);
				return !!workbook.getWorksheet(sheetName);
			} catch {
				return false;
			}
		} else {
			try {
				await access(path);
				return true;
			} catch {
				return false;
			}
		}
	}

	async getCollections(): Promise<string[]> {
		if (this.opts.file) {
			try {
				const workbook = new ExcelJS.Workbook();
				await workbook.xlsx.readFile(this.opts.file);
				return workbook.worksheets.map(ws => ws.name);
			} catch {
				return [];
			}
		} else if (this.opts.dir) {
			try {
				const files = await readdir(this.opts.dir, {
					recursive: true,
				});
				return files.map(f => (f.endsWith(".xlsx") ? f.slice(0, -5) : f));
			} catch {
				return [];
			}
		} else {
			return [];
		}
	}

	async removeCollection(collection: string): Promise<boolean> {
		if (this.opts.file) {
			const path = this._getPath(collection);
			try {
				const workbook = new ExcelJS.Workbook();
				await workbook.xlsx.readFile(path);
				const sheetName = this._getSheetName(collection);
				const sheet = workbook.getWorksheet(sheetName);
				if (sheet) {
					workbook.removeWorksheet(sheet.id);
					if (workbook.worksheets.length > 0) {
						await workbook.xlsx.writeFile(path);
					} else {
						await rm(path);
					}
					return true;
				}
				return false;
			} catch {
				return false;
			}
		} else {
			await rm(this._getPath(collection));
			return true;
		}
	}
}
