/**
 * Symbols that Tally Prime provides itself. Referencing these is legal; the
 * linter must not report them as missing local declarations.
 */
export const BUILTINS = new Set([
  // built-in styles
  "UseFormCtrl", "UseNativeCtrl", "Normal", "Title", "Bold", "Italics",
  "ByRegion", "Inverted", "TDLColorComboBox", "TDLDefaultStyle",
  "JpHdr", "JpBody", "JpTitle", "JpSub", "JpGridHead", "JpGrid",
  "JpCardHdr", "JpCardVal", "JpMoney", "JpWeight", "JpTotal", "JpWarn",
  "JpMuted", "JpMoneyBold", "JpWeightBold", "JpCenter", "JpRight",
  "JpBigNum", "JpSectionBox", "JpGoldBand", "JpTagText",
  // built-in parts / fields
  "Width", "FormCtrl", "BasicUserDetails", "NavBar", "ButtonBar",
  "NavigationBar", "TopBar", "Footer", "Header", "QuickSearch", "ReportToolbar",
  "ExplorerBar", "SidePane", "List", "Details", "Totals", "InnerPart",
  // built-in functions
  "String", "Round", "RoundOf", "Upr", "Abs", "Sqrt", "Len", "Left",
  "Right", "Mid", "Replace", "IsEmpty", "IsNull", "Date", "Year", "Month",
  "Day", "Now", "Today", "Company", "Spar", "Group", "Sys", "Symbol",
  "Ledger", "Item", "Voucher", "Godown", "Number", "Print", "Display",
  "Browse", "Exit", "Modify", "Aggregate", "Compute", "Fixed", "Else",
  "Local", "Report", "Export", "Import", "Message", "Prompt", "Ask",
  "Confirm", "Cancel", "Save", "Accept", "Reject", "Close", "Refresh",
  "Field", "Part", "Value", "Note", "Currency", "Translated", "Bool",
]);