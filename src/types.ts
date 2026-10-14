/**
 * A GEDCOM value: plain text, a nested node, or a list of repeated nodes.
 */
export type GedValue = string | GedNode | GedValue[];

/**
 * A parsed GEDCOM node. Child tags become keys, the node's own value is
 * stored in `_value`, repeated tags become arrays.
 */
export interface GedNode {
	_value?: string;
	[key: string]: GedValue | undefined;
}

/**
 * A level-0 GEDCOM record. `_id` holds the xref (e.g. `@I1@`) or a generated id.
 */
export interface GedEntry extends GedNode {
	_id: string;
}

/**
 * Standard GEDCOM level-0 record tags usable as collection names.
 */
export type GedTag =
	| "HEAD"
	| "INDI"
	| "FAM"
	| "SOUR"
	| "REPO"
	| "SUBM"
	| "NOTE"
	| "OBJE"
	| "SUBN"
	| "TRLR";
