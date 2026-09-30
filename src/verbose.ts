let v = false;

export function setVerbose(value: boolean) {
	v = value;
}

export function verbose(...args: any[]) {
	if (!v) return;
	console.log(...args);
}
