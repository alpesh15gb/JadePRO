/**
 * TDL keyword vocabulary for lint.mjs.
 *
 * This used to be a hand-written list of "legal" keywords. It was the reason
 * this codebase shipped a TallyPrime TDL full of invented attributes and still
 * linted clean: Field-id, Part-id, Part Name, Var, Param, Returns, Text, Font,
 * Paper and Margin-* were all marked legal, because the same invented
 * vocabulary produced the TDL in the first place. A linter cannot catch a class
 * of error whose assumption it shares with the thing being checked.
 *
 * It is now DERIVED from tdl-attributes.mjs, which transcribes the grouped
 * attribute list each TallyPrime definition page publishes. lint.mjs uses this
 * as a spelling check - "is this word an attribute of anything at all?" -
 * while routing an attribute to the definition type that accepts it is
 * lint-attributes.mjs's job.
 */
import { ATTRS as PER_TYPE } from "./tdl-attributes.mjs";

const titleCase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Every attribute of every definition type, plus the type names themselves. */
export const ATTRS = new Set([
  ...PER_TYPE.keys(),
  ...[...PER_TYPE.values()].flatMap((row) => row.names.map(titleCase)),
  // Object/menu nouns that appear as the leading word of an indented line.
  "Item", "Ledger", "Stock", "Voucher", "Company", "Group", "Node", "Menu",
  "Field", "Collection", "Report", "Function", "Variable", "Style", "System",
  "Border", "Button", "Form", "Part", "Line", "Color", "Name", "Part-id",
]);

/** Tokens that are legal values but could also look like a keyword. */
export const VALUE_TOKENS = new Set([
  "BOLD", "ITALICS", "RIGHT", "CENTRE", "CENTER", "LEFT", "BOTH", "NOZERO",
  "YES", "NO", "AGGREGATE", "STRING", "NUMBER", "LOGICAL", "DATE", "AMOUNT",
  "QUANTITY", "RATE", "TEXT", "SCREEN", "PAGE", "VERTICAL", "HORIZONTAL",
  "NORMAL", "DOUBLELINED", "SOLID", "THIN", "THICK", "STATIC", "ALWAYS",
  "NEVER", "SYSTEM", "OBJECT", "VOUCHER", "LEDGER", "STOCKITEM",
]);