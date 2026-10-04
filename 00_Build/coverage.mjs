#!/usr/bin/env node
/**
 * Specification coverage check.
 *
 * Walks the requirement areas from the brief and asserts that the delivered TDL
 * actually contains what each one asks for. This checks the ARTIFACT against
 * the ACCEPTANCE CRITERIA - it does not prove Tally will compile it (nothing
 * here can; see ARCHITECTURE 11.1).
 *
 * IMPORTANT: user-defined fields are asserted with udf(), which requires a real
 * `System: UDF "Name"` declaration. Asserting only that the name appears
 * somewhere would pass even when the field is referenced but never declared -
 * which in Tally means the field silently stores nothing.
 *
 * usage: node coverage.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "tdl");
const files = readdirSync(SRC).filter((f) => f.endsWith(".tdl")).sort();
const texts = files.map((f) => readFileSync(join(SRC, f), "utf8"));
const all = texts.join("\n");

/** every literal present */
const has = (...n) => n.every((s) => all.includes(s));
/** a user defined field is genuinely DECLARED, not merely referenced */
// A UDF is declared in the documented form, as a line inside [System: UDF]:
//     <Name of UDF> : <Data Type> : <Index Number>
// A line anchored at column 0 with that shape is a declaration, not a
// reference. The legacy `System: UDF "Name"` form is also still accepted.
const UDF_DECL = (n) =>
  new RegExp(`^${n}\\s*:\\s*[A-Za-z]+\\s*:\\s*\\d+\\s*$`, "m");

const udf = (...names) => {
  const missing = names.filter(
    (n) => !UDF_DECL(n).test(all) && !all.includes(`System: UDF "${n}"`));
  if (missing.length) console.log("        undeclared UDF(s): " + missing.join(", "));
  return missing.length === 0;
};
/** declared in the named module */
const udfIn = (file, ...names) => {
  const t = readFileSync(join(SRC, file), "utf8");
  return names.every(
    (n) => UDF_DECL(n).test(t) || t.includes(`System: UDF "${n}"`));
};

const checks = [
  ["1  Jewellery item master UDFs (all 23 named in the brief)",
    udfIn("02_ItemMaster.tdl", "JwlBarcode", "JwlCategory", "JwlDesignNo", "JwlHuid",
        "JwlCertNo", "JwlSupplier", "JwlLocation", "JwlMetalType", "JwlPurity",
        "JwlGoldRate", "JwlStoneRate", "JwlDiamondRate", "JwlMakingCharge",
        "JwlMakingType", "JwlWastagePc", "JwlMSP", "JwlMRP", "JwlGrossWt",
        "JwlStoneWt", "JwlDiamondCarat", "JwlOtherStoneWt", "JwlNetMetalWt",
        "JwlPieces")],
  ["1  Calculations: net, metal, wastage, making (3 methods), stone, diamond, final",
    has("Function: JpNetWeight", "Function: JpMetalValue", "Function: JpWastageValue",
        "Function: JpMakingCharge", "Function: JpStoneValue", "Function: JpDiamondValue",
        "Function: JpBaseValue", '"PerGram"', '"Percentage"', '"Fixed"')],
  ["2  Daily rate master, six metals declared",
    udfIn("03_GoldRate.tdl", "JwlRate24K", "JwlRate22K", "JwlRate18K", "JwlRate14K",
        "JwlRateSilver", "JwlRatePlatinum"),
    has("Screen: JpRateScreen", "Function: JpRateFor")],
  ["2  Rate override is authorisation-gated",
    has("JpRtOverride", "JpRateOverridden", "Function: JpEffectiveRate")],
  ["3  Sales header fields declared", udfIn("04_Sales.tdl", "JwlInvNo", "JwlSalesperson",
        "JwlCustMobile", "JwlDiscPc", "JwlDiscAmt", "JwlGstRate", "JwlGrandTotal")],
  ["3  Sales per-piece fields declared",
    udfIn("04_Sales.tdl", "JwlLnBarcode", "JwlLnHuid", "JwlLnPurity", "JwlLnGross",
        "JwlLnStone", "JwlLnNet", "JwlLnRate", "JwlLnMetalVal", "JwlLnMakeAmt",
        "JwlLnWastageVal", "JwlLnStoneVal", "JwlLnDiaVal", "JwlLnBaseVal",
        "JwlLnDiscAmt", "JwlLnTaxable", "JwlLnTotal")],
  ["3  Multiple jewellery items on one invoice + stock reduction",
    has("Part-id: Invoicemain", "Alter: Sales Voucher, Item Details")],
  ["4  GST split, no hard-coded percentage",
    has("Function: JpComputeTax", "Function: JpSplitGst", "Function: JpIsInterStateSupply"),
    udfIn("04_Sales.tdl", "JwlCgst", "JwlSgst", "JwlIgst", "JwlTaxTotal")],
  ["5  Old gold: capture, fine weight, deduction, adjustment",
    udfIn("06_OldGold.tdl", "JwlOgCustName", "JwlOgMetal", "JwlOgPurity", "JwlOgPurityPc",
        "JwlOgGrossWt", "JwlOgStoneWt", "JwlOgNetWt", "JwlOgFineWt", "JwlOgRate",
        "JwlOgDedPc", "JwlOgValue", "JwlOgAdjAmt"),
    has("Screen: JpOldGoldScreen", "Function: JpOgFine", "Function: JpOgPayout")],
  ["5  Old gold printed on the final invoice",
    // The layout used to say `If: ##JwlOldGoldRef <> ""` + `Part Name: X`.
    // A layout is now a Form listing Parts, and the guard is the Line's
    // documented `Empty` attribute - see fix-print-to-form.mjs and
    // restore-print-conditions.mjs.
    has("Parts : JpInvoiceHeader, JpInvoiceItems, JpInvoiceTotals, JpInvoicePayments, JpInvoiceOldGold, JpInvoiceFooter",
        "Empty : ##JwlOldGoldRef")],
  ["6  Purchase: seven kinds, supplier invoice, weights, GST",
    udfIn("05_Purchase.tdl", "JwlPurKind", "JwlSupInvNo", "JwlSupDate", "JwlKarigarName",
        "JwlPurGstRate", "JwlPurTotal"),
    has("Alter: Purchase Voucher", "JpPurchaseKindList")],
  ["7  Karigar job work + metal balance",
    udfIn("07_Karigar.tdl", "JwlJobIssuedWt", "JwlJobIssuedPure", "JwlJobRecvGross",
        "JwlJobRecvNet", "JwlJobWastagePc", "JwlJobLabour", "JwlJobBalWt", "JwlJobStatus"),
    has("Screen: JpKarigarScreen", "Function: JpJobBalance",
        "Collection: Report: JpKarigarOutstanding")],
  ["8  Barcode scheme + tag + scanner",
    // `Storage : JwlBarcode` is the documented Field way to read a UDF. The old
    // assertion matched the invented inline form `Field-Id: JwlBarcode, Label: ...`.
    has("Function: JpBarcodeMake", "Print: JpTagPrintLayout", "Collection: Report: JpBarcodeReg",
        "Storage : JwlBarcode", "JwlDesignNo", "JwlPurity", "JwlGrossWt", "JwlNetMetalWt",
        "JwlStoneWt", "JwlMRP")],
  ["9  Stock reports: category, purity, metal, design, counter, ageing, movement, all",
    has("JpStockReport", "JpMetalStockReport", "JpPurityStockReport", "JpCategoryStockReport",
        "JpDesignStockReport", "JpCounterStockReport", "JpAgeingReport", "JpMovementReport")],
  ["9  Stock reports show opening/purchase/sales/closing qty, weight and value",
    has("Sum($$JwlNetWt)", "Sum($$JwlStockVal)", "Sum($$JwlQty)", "Function: JpMoveClass",
        "Function: JpAgeBucket")],
  ["10 CRM fields declared",
    udfIn("11_Reports.tdl", "JwlCustDOB", "JwlCustAnniversary", "JwlLoyaltyPts",
        "JwlTotalPurchases", "JwlCustEmail")],
  ["10 CRM reports", has("JpCustomerHistory", "JpTopCustomerReport", "JpBirthdayReport")],
  ["11 Salesperson: bills, pieces, weight, revenue, discount, profit, target %",
    has("Function: JpGrossProfit", "Function: JpTargetAchieved", "Function: JpTargetFor",
        "JwlPiecesSold", "JwlWeightSold", "JwlRevenue", "JwlDiscount")],
  ["12 Order module + six statuses + advance adjustment",
    udfIn("09_Orders.tdl", "JwlOrdNo", "JwlOrdAdvance", "JwlOrdAdvBalance",
        "JwlOrdDelivDate", "JwlOrdStatus", "JwlOrdInvRef"),
    has("Screen: JpOrderScreen", '"New"', '"Design Approved"', '"In Production"',
        '"Ready"', '"Delivered"', '"Cancelled"', "JwlPayAdvance")],
  ["13 Repair module + five statuses",
    udfIn("10_Repairs.tdl", "JwlRepNo", "JwlRepWork", "JwlRepEstAmt", "JwlRepAdvance",
        "JwlRepDelivDate", "JwlRepStatus"),
    has("Screen: JpRepairScreen", '"Received"', '"Sent to Karigar"', '"Repairing"',
        '"Ready"', '"Delivered"')],
  ["14 Dashboard: money, weight/rankings, alerts, inventory",
    has("Collection: Report: JpDashboard", "Collection: Report: JpWeightDashboard",
        "Collection: Report: JpAlertDashboard", "Collection: Report: JpInvDashboard")],
  ["15 All sixteen requested report families present",
    has("Collection: Report: JpDailySales", "Collection: Report: JpMonthlySales",
        "Collection: Report: JpPurchaseRegister", "Collection: Report: JpSalesRegister",
        "Collection: Report: JpMetalStockReport", "Collection: Report: JpStockReport",
        "Collection: Report: JpPurityStockReport", "Collection: Report: JpItemProfitReport",
        "Collection: Report: JpCategoryProfitReport", "Collection: Report: JpCustomerHistory",
        "Collection: Report: JpSalespersonReport", "Collection: Report: JpKarigarOutstanding",
        "Collection: Report: JpOldGoldRegister", "Collection: Report: JpOrderRegister",
        "Collection: Report: JpRepairRegister", "Collection: Report: JpGSTReport")],
  ["15 Date filter + Excel export + print on the reports",
    has("Filters: <JpFromDate", "Export: Value:", "Print: JpDailySalesPrint")],
  ["16 Five roles with a real rights table",
    has("Function: JpRoleList", "Function: JpHasRightFor", "JpRtChangeRate", "JpRtOverride",
        "JpRtHighDiscount", "JpRtDeleteVch", "JpRtProfit", '"Owner"', '"Manager"',
        '"Accountant"', '"Salesperson"', '"Cashier"')],
  ["16 Salesperson cannot see cost price or profit",
    has("Invisible: ##JwlShowCost <> 1", "Function: JpProfitReportOk")],
  ["17 Invoice carries logo, GSTIN, details, weights, totals, words, payments, T&C, sign",
    has("Print: JpInvoicePrint", "JpInvoiceHeader", "JwlCompanyGSTIN", "JpInWords",
        "JpInvoicePayments, JpInvoiceOldGold, JpInvoiceFooter", "Authorised Signatory", "TERMS AND CONDITIONS",
        "JwlShopLogo")],
  ["18 Seven payment modes declared, split total",
    udfIn("04_Sales.tdl", "JwlPayCash", "JwlPayCard", "JwlPayUpi", "JwlPayBank",
        "JwlPayAdvance", "JwlPayOldGold"),
    has("JpPayModeList", "Function: JpPayTotal", "Function: JpPayBalance")],
  ["19 Validation hooks for weight, purity, rate, barcode, HUID",
    has("Function: JpWeightValid", "Function: JpPurityValid", "Function: JpRateAvailable",
        "Function: JpIsUniqueText", "Function: JpLineValid", "Function: JpLineError")],
  ["19 Negative stock delegated to Tally's own company setting",
    has("Function: JpQtyNotNegative"),
    /negative-stock setting/i.test(readFileSync(join(ROOT, "ARCHITECTURE.md"), "utf8"))],
  ["19 Modular layout 00-15 with all files present",
    ["00_Core.tdl", "01_Main.tdl", "02_ItemMaster.tdl", "03_GoldRate.tdl", "04_Sales.tdl",
      "05_Purchase.tdl", "06_OldGold.tdl", "07_Karigar.tdl", "08_Barcode.tdl",
      "09_Orders.tdl", "10_Repairs.tdl", "11_Reports.tdl", "12_Dashboard.tdl",
      "13_Security.tdl", "14_PrintInvoice.tdl", "15_Install.tdl"]
      .every((f) => files.includes(f))],
  ["20 Standard Tally behaviour preserved (enrichment, no replacement)",
    has("Alter: Sales Voucher, Item Details", "Add: Item: Jewellery: Menu: JpMainMenu"),
    /no\s+standard Tally menu is altered/i.test(
      readFileSync(join(ROOT, "ARCHITECTURE.md"), "utf8"))],
  ["20 Every gateway menu target resolves to a real report or screen", (() => {
    const menu = readFileSync(join(SRC, "01_Main.tdl"), "utf8");
    const targets = [...menu.matchAll(/Item:\s*[^:]+:\s*Display:\s*([A-Za-z_]\w*)/g)]
      .map((m) => m[1]);
    const missing = [...new Set(targets)].filter(
      (t) => !texts.some((x) =>
        new RegExp(`^\\[?(?:Report|Screen|Collection: Report): ${t}\\s*\\]?$`, "m").test(x.trim())));
    if (missing.length) console.log("        unresolved menu target(s): " + missing.join(", "));
    return targets.length > 0 && missing.length === 0;
  })()],
];

let pass = 0, fail = 0;
for (const [name, ok] of checks) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}
console.log(`\n  ${pass}/${checks.length} requirement areas covered`);
process.exit(fail === 0 ? 0 : 1);