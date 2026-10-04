# JadePro Jewellery ERP for Tally Prime — Architecture

**Version 1.0.0 · 18 modules · 13,041 lines · 219 UDFs · 19 reports/screens**

This document is the design record. Read section 11 before loading anything —
it lists exactly what has and has not been verified, and the four constructs
you must confirm on your Tally build.

---

## 1. Architecture

### 1.1 The central decision

JadePro **enriches Tally's standard Sales and Purchase vouchers** instead of
replacing them with custom voucher types.

This was chosen over custom voucher types for five concrete reasons:

| Concern | Consequence of the decision |
|---|---|
| TDL cannot reliably create voucher types | `Create: VoucherType:` is not a documented TDL action. A custom voucher type would have to be created by hand, and a shop owner would have to repeat that on every new company. |
| GST | Tally's own GST returns, e-invoicing and e-way bill read the standard voucher structure. Enriching preserves all of it for free. |
| Banking & reconciliation | Standard Sales feeds bank reconciliation, TDS and the P&L unchanged. |
| Inventory | Tally's own inventory engine reduces stock by weight. That is the hard part of jewellery billing and we do not re-implement it. |
| Reversibility | If JadePro is unloaded, the company is left with ordinary Tally vouchers containing ordinary data plus a few extra custom fields. Nothing is orphaned. |

The custom business events that Tally has no voucher type for — daily rate
master, old gold exchange, karigar job work, customer orders and repairs — are
stored as **Journal vouchers tagged by `JwlVchKind`**. They post to ordinary
ledgers (Gold, Old Gold Received, Karigar Metal Held, Customer Advance …), so
they appear in the right balance sheet accounts and in the audit trail. If you
later want real voucher types, create them in Tally and change the one Constant
that names each journal's purpose — nothing else changes.

### 1.2 Layer structure

```
                    ┌──────────────────────────────────────────┐
   UI LAYER         │ Screens  (04, 06, 07, 09, 10, 15)        │
                    │ Altered masters & vouchers (01,02,04,05,  │
                    │   07,11,13)                              │
                    └────────────────┬─────────────────────────┘
                                     │
   LOGIC LAYER      ┌────────────────▼─────────────────────────┐
                    │ 00_Core function library (46 functions)   │
                    │ calculation · rate engine · validation ·  │
                    │ security · payments · amount-in-words      │
                    └────────────────┬─────────────────────────┘
                                     │
   DATA LAYER       ┌────────────────▼─────────────────────────┐
                    │ 218 UDFs across Item, Ledger, Voucher     │
                    │ and Company masters                       │
                    │ Standard Tally ledgers, godowns, vouchers │
                    └────────────────┬─────────────────────────┘
                                     │
   REPORT LAYER     ┌────────────────▼─────────────────────────┐
                    │ SQL-backed Collection reports (07,11,12)  │
                    │ print · Excel export · filters · drill-   │
                    │ down                                     │
                    └──────────────────────────────────────────┘
```

### 1.3 Module map

| # | Module | Lines | Responsibility | Depends on |
|---|---|---|---|---|
| 00 | `00_Core.tdl` | 1170 | Constants, globals, calculation/rate/validation/security library | — |
| 01 | `01_Main.tdl` | 250 | Gateway menu, Company master settings, About report | 00 |
| 02 | `02_ItemMaster.tdl` | 1010 | 30 item UDFs, Alter Item block, Create Item screen | 00 |
| 03 | `03_GoldRate.tdl` | 270 | Daily rate master, rate engine entry points | 00 |
| 04 | `04_Sales.tdl` | 750 | Sales header + per-piece grid + GST + payments | 00,02,03 |
| 05 | `05_Purchase.tdl` | 350 | Purchase header + per-piece grid | 00,02,03,04 |
| 06 | `06_OldGold.tdl` | 400 | Old gold exchange, fine weight, adjustment | 00,03,04 |
| 07 | `07_Karigar.tdl` | 620 | Karigar master block, job work, outstanding report | 00,03,04 |
| 08 | `08_Barcode.tdl` | 380 | Barcode scheme, jewellery tag, barcode register | 00,02 |
| 08a | `08a_BarcodeTally.tdl` | 335 | Tally-native Code 128 tags, bulk print, scanner screen | 00,02,08 |
| 08b | `08b_BarcodeZPL.tdl` | 535 | Zebra label profile, setup, print queue + CSV export | 00,02,08 |
| 09 | `09_Orders.tdl` | 480 | Custom order lifecycle + register | 00,04 |
| 10 | `10_Repairs.tdl` | 430 | Repair lifecycle + register | 00,04 |
| 11 | `11_Reports.tdl` | 2420 | CRM block + 20 drill-down reports | 00,04,05,07 |
| 12 | `12_Dashboard.tdl` | 620 | Four dashboard card reports | 00,04,11 |
| 13 | `13_Security.tdl` | 470 | Role rights table, user mapping, targets | 00 |
| 14 | `14_PrintInvoice.tdl` | 290 | Premium invoice print + old gold annexure | 00,04,06 |
| 15 | `15_Install.tdl` | 270 | Master creation, setup checklist | all |

---

## 2. User Defined Fields (218 total)

All are declared with `System: UDF` inside the module that owns them, so the
declaration is never separated from the code that uses it. Every name is
prefixed `Jwl` and therefore cannot collide with another product.

### 2.1 Company master (13) — `01_Main.tdl`

| UDF | Type | Purpose |
|---|---|---|
| `JwlJadeProOn` | Logical | Master switch. Toggles the whole JadePro block on the Company master. |
| `JwlShopName` | Text | Invoice letterhead |
| `JwlShopAddress` | Text | Invoice letterhead |
| `JwlShopLogo` | Text | Logo path |
| `JwlCompanyGSTIN` | Text | Invoice letterhead |
| `JwlCompanyPhone` | Text | Invoice letterhead |
| `JwlCompanyState` | Text | Drives the CGST/SGST vs IGST decision |
| `JwlDefaultGstRate` | Number | Default slab offered on the sales header |
| `JwlMaxDiscountPc` | Number | Discount ceiling enforced for Salespeople |
| `JwlOldGoldDedPc` | Number | Default old-gold deduction |
| `JwlInvoiceTerms` | Text | Terms block on the invoice |
| `JwlCommissionPc` | Number | Salesperson commission |
| `JwlUserRoleMap` | Text | `User|Role|User|Role` security map |
| `JwlRoleSetupDone` | Logical | Set once roles are mapped |
| `JwlSalesTargets` | Text | `Name,Target|Name,Target` |

### 2.2 Item master (30) — `02_ItemMaster.tdl`

`JwlIsJewellery`, `JwlBarcode`, `JwlCategory`, `JwlDesignNo`, `JwlHuid`,
`JwlCertNo`, `JwlSupplier`, `JwlLocation`, `JwlMetalType`, `JwlPurity`,
`JwlGoldRate`, `JwlGrossWt`, `JwlStoneWt`, `JwlDiamondCarat`,
`JwlOtherStoneWt`, `JwlNetMetalWt`, `JwlPieces`, `JwlStoneRate`,
`JwlDiamondRate`, `JwlMakingCharge`, `JwlMakingType`, `JwlWastagePc`,
`JwlMSP`, `JwlMRP`, `JwlMetalValue`, `JwlWastageValue`, `JwlStoneValue`,
`JwlDiamondValue`, `JwlFinalValue`, `JwlMakingChargeComputed`.

> `JwlMakingCharge` is the **user's input**; `JwlMakingChargeComputed` is the
> **calculated** amount. Keeping them apart means pressing *Recalculate* can
> never overwrite what the user typed.

### 2.3 Ledger master (14) — `07_Karigar.tdl`, `11_Reports.tdl`

Karigar: `JwlIsKarigar`, `JwlKarigarSpeciality`, `JwlKarigarCity`,
`JwlKarigarPan`, `JwlKarigarOpenWt`, `JwlKarigarOpenAmt`.
CRM: `JwlCustDOB`, `JwlCustAnniversary`, `JwlCustEmail`, `JwlCustMobile2`,
`JwlCustSeg`, `JwlLoyaltyPts`, `JwlPartyState`, `JwlTotalPurchases`.

### 2.4 Sales voucher (28 header + 31 per-piece) — `04_Sales.tdl`

Header: `JwlInvNo`, `JwlSalesperson`, `JwlCustMobile`, `JwlPayMode`,
`JwlPayCash`, `JwlPayCard`, `JwlPayUpi`, `JwlPayBank`, `JwlPayAdvance`,
`JwlPayOldGold`, `JwlDiscPc`, `JwlDiscAmt`, `JwlGstRate`, `JwlTaxableVal`,
`JwlMakeVal`, `JwlCgst`, `JwlSgst`, `JwlIgst`, `JwlTaxTotal`,
`JwlGrandTotal`, `JwlPayTotal`, `JwlPayBalance`, `JwlInterState`,
`JwlOldGoldRef`, `JwlOrderRef`, `JwlRepairRef`.

**Per inventory entry line** (this is what makes a multi-piece jewellery
invoice work): `JwlLnBarcode`, `JwlLnHuid`, `JwlLnPurity`, `JwlLnMetal`,
`JwlLnGross`, `JwlLnStone`, `JwlLnCarat`, `JwlLnNet`, `JwlLnRate`,
`JwlLnMetalVal`, `JwlLnWastagePc`, `JwlLnWastageVal`, `JwlLnMakeType`,
`JwlLnMakeAmtIn`, `JwlLnMakeAmt`, `JwlLnStoneRate`, `JwlLnStoneVal`,
`JwlLnDiaRate`, `JwlLnDiaVal`, `JwlLnBaseVal`, `JwlLnDiscPc`, `JwlLnDiscAmt`,
`JwlLnTaxable`, `JwlLnTotal`, `JwlLnCost`.

### 2.5 Purchase voucher (27) — `05_Purchase.tdl`

Header: `JwlPurKind`, `JwlSupInvNo`, `JwlSupDate`, `JwlKarigarName`,
`JwlPurDiscAmt`, `JwlPurGstRate`, `JwlPurIgst`, `JwlPurTotal`,
`JwlPurMetalWt`, `JwlPurStoneWt`.
Per line: `JwlPlBarcode`, `JwlPlHuid`, `JwlPlPurity`, `JwlPlMetal`,
`JwlPlGross`, `JwlPlStone`, `JwlPlCarat`, `JwlPlNet`, `JwlPlRate`,
`JwlPlMetalVal`, `JwlPlWastagePc`, `JwlPlWastageVal`, `JwlPlMakeType`,
`JwlPlMakeAmtIn`, `JwlPlMakeAmt`, `JwlPlStoneRate`, `JwlPlStoneVal`,
`JwlPlDiaRate`, `JwlPlDiaVal`, `JwlPlTotal`.

### 2.6 Rate master (11) — `03_GoldRate.tdl`

`JwlRate24K`, `JwlRate22K`, `JwlRate18K`, `JwlRate14K`, `JwlRateSilver`,
`JwlRateSilver800`, `JwlRatePlatinum`, `JwlRateApprovedBy`, `JwlRateChangePc`,
`JwlRateNote`, plus the shared `JwlVchKind` discriminator used by every
JadePro voucher.

### 2.7 Old gold (15), karigar (18), order (15), repair (18), barcode (3)

`06_OldGold.tdl`: `JwlOgVchNo`, `JwlOgCustName`, `JwlOgMetal`, `JwlOgPurity`,
`JwlOgPurityPc`, `JwlOgGrossWt`, `JwlOgStoneWt`, `JwlOgNetWt`, `JwlOgFineWt`,
`JwlOgRate`, `JwlOgDedPc`, `JwlOgValue`, `JwlOgAdjAmt`, `JwlOgBalAmt`,
`JwlOgPayMode`, `JwlOgHallmark`, `JwlOgNote`.

`07_Karigar.tdl`: `JwlJobNo`, `JwlJobKarigar`, `JwlJobType`, `JwlJobDesc`,
`JwlJobDesign`, `JwlJobIssuedDate`, `JwlJobIssuedWt`, `JwlJobIssuedPure`,
`JwlJobIssuedRate`, `JwlJobRecvDate`, `JwlJobRecvGross`, `JwlJobRecvNet`,
`JwlJobWastagePc`, `JwlJobWastageWt`, `JwlJobLabour`, `JwlJobBalWt`,
`JwlJobStatus`.

`09_Orders.tdl`: `JwlOrdNo`, `JwlOrdCust`, `JwlOrdType`, `JwlOrdDesignRef`,
`JwlOrdExpWt`, `JwlOrdPurity`, `JwlOrdExpPrice`, `JwlOrdAdvance`,
`JwlOrdAdvBalance`, `JwlOrdDelivDate`, `JwlOrdKarigar`, `JwlOrdStatus`,
`JwlOrdInvRef`, `JwlOrdNote`.

`10_Repairs.tdl`: `JwlRepNo`, `JwlRepCust`, `JwlRepContact`, `JwlRepDesc`,
`JwlRepMetal`, `JwlRepPurity`, `JwlRepGrossWt`, `JwlRepStoneWt`,
`JwlRepNetWt`, `JwlRepStoneDetail`, `JwlRepWork`, `JwlRepKarigar`,
`JwlRepEstAmt`, `JwlRepAdvance`, `JwlRepBalance`, `JwlRepDelivDate`,
`JwlRepStatus`, `JwlRepRecvDate`.

`08_Barcode.tdl`: `JADEPRO_VER` plus the shared `JwlVchKind`.

`08a_BarcodeTally.tdl`: no UDFs — it only reads the item's existing
`JwlBarcode` and adds print formats and screens.

`08b_BarcodeZPL.tdl`: `JplZplSettings` — one delimited `key=value;` printer
profile string held on the Company master, so the label layout is data rather
than something a user has to edit TDL to change.

---

## 3. Voucher types required

**None.** JadePro adds no voucher type. See §1.1.

| Business event | Tally voucher | Discriminator | Ledger posting |
|---|---|---|---|
| Jewellery sale | `Sales` | `JwlVchKind = "STANDARD"` | Standard party + GST ledgers |
| Jewellery purchase | `Purchase` | `JwlVchKind = "STANDARD"` | Standard supplier + GST ledgers |
| Daily rate master | `Journal` | `JwlVchKind = "RateMaster"` | none (rate reference only) |
| Old gold exchange | `Journal` | `JwlVchKind = "OldGold"` | Dr Old Gold Received / Cr Old Gold Exchange Payable |
| Karigar job work | `Journal` | `JwlVchKind = "KarigarJob"` | Dr Karigar Metal Held / Cr Gold |
| Customer order | `Journal` | `JwlVchKind = "Order"` | Dr Cash / Cr Order Advance Received |
| Jewellery repair | `Journal` | `JwlVchKind = "Repair"` | Dr Cash / Cr Repairs Income |

`JwlVchKind` is the single field every JadePro report filters on, which is why
all twenty reports stay fast.

---

## 4. Masters required

Created by **Jewellery → System → JadePro Setup / Install** (F2). Nothing is
created until you press F2.

**Ledger groups** — Jewellery Metal Stock, Old Gold, Karigar, Jewellers,
Order & Repair Income.

**Ledgers** — Gold, Silver, Platinum, Diamond, Loose Stones, Old Gold Received,
Old Gold Exchange Payable, Karigar Metal Held, Karigar Labour Payable,
Jewellery Purchase, Jewellery Sales, Customer Advance, Order Advance Received,
Repairs Income.

**Godowns** — Main Counter, Store Room, Karigar Workshop.

**You must do these by hand (TDL cannot do them for you):**

1. Set every jewellery item's **UOM to GMS** — weight reports read the Tally
   inventory quantity, so grams come for free only if the UOM is grams.
2. Enable **Gateway → Settings → Enable JadePro Jewellery** and fill the company
   block (shop name, GSTIN, state, discount ceiling, old-gold deduction).
3. Map **Tally users to roles** (Jewellery → System → Role Setup).
4. Enter **today's rate master** before the first bill of the day.
5. Set the Sales and Purchase **print styles** to the JadePro format.
6. Configure **Tally's own GST** (Gateway → Settings → Taxes and GST). JadePro
   deliberately does not create tax ledgers or percentages — that would put the
   statutory reports at risk. JadePro *reads* Tally's tax, it never restates it.

---

## 5. Calculation logic

### 5.1 Purity and fineness

```
24K → 0.999      22K → 0.9167     18K → 0.7500     14K → 0.5833
9K  → 0.4375     925 → 0.9250     800 → 0.8000     PT950 → 0.9500
```

An unknown purity returns 0, and 0 is treated as a hard validation failure —
never as "silently zero".

### 5.2 Jewellery value

```
Net Weight     = Gross Weight − Stone Weight        (clamped at ≥ 0)
Metal Value    = Net Weight × Metal Rate
Wastage Value  = Metal Value × Wastage %
Making Charge  = PerGram    : Net Weight × Metal Rate × Making %
                 Percentage : Metal Value × Making %
                 Fixed      : the entered amount
Stone Value    = Stone Weight × Stone Rate
Diamond Value  = Diamond Carat × Diamond Rate
Base Value     = Metal + Wastage + Making + Stone + Diamond
Line Total     = (Base Value − Discount) + GST
Grand Total    = Taxable Value + CGST + SGST + IGST
```

Rate precedence: **item's own rate → today's rate master → 0** (which triggers
the "Missing daily gold rate" validation).

### 5.3 GST — no hard-coded percentages

`JpSplitGst(taxable, rate, interState)` splits a total into CGST/SGST (half
each) or IGST. The **rate is never written in this codebase** — it comes from
`JwlGstRate` on the voucher, which the cashier selects from Tally's own GST
rate masters, defaulting from `JwlDefaultGstRate` on the Company master. When
the government changes a slab, you edit the master. No TDL change.

### 5.4 Old gold

```
Net Weight     = Gross Weight − Stone Weight
Fine Weight    = Net Weight × Purity Percentage
Exchange Value = Fine Weight × Rate for that purity
Payout         = Exchange Value − (Exchange Value × Deduction %)
Refundable     = Payout − Amount adjusted against the new purchase
```

A specific assay (say 916.5) is honoured exactly rather than snapped to the
22K table value.

### 5.5 Karigar

```
Wastage Given  = if % stated: Received Net × %  else: Issued − Received
Balance        = Issued − Received Net − Wastage Given
```

### 5.6 Payments

Six modes (Cash, Card, UPI, Bank Transfer, Customer Advance, Old Gold
Exchange) each with their own field, plus:

```
Total Received = sum of the six
Balance Due    = Grand Total − Total Received
```

### 5.7 Amount in words

`JpInWords()` implements the Indian numbering system (Crore / Lakh / Thousand)
with paise, e.g. *"Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty
Seven and Eighty Nine Paise Only"*.

### 5.8 Rounding

All money passes through `JpRound()` (2 dp) and all weights through
`JpRoundWt()` (3 dp). The on-screen value, the ledger posting and the printed
bill therefore cannot disagree by a paisa.

---

## 6. Menu structure

`Gateway of Tally → Jewellery`

```
Daily Operations
  Daily Gold / Silver Rate          Jewellery Sales Invoice
  Jewellery Purchase               Old Gold Exchange
  Karigar Job Work                 Advance / Custom Order
  Jewellery Repair                 Print Jewellery Tag

Masters
  Create Jewellery Item            Alter Jewellery Item
  Barcode / Tag Register

Dashboard
  1 of 4 – Sales and Collections
  2 of 4 – Gold Sold and Top Performers
  3 of 4 – Pending Orders, Repairs, Karigar Metal
  4 of 4 – Inventory and Stock Value

Sales Reports
  Daily Sales                      Monthly Sales
  Sales Register                   Salesperson Performance
  Item Profitability               Category Profitability

Inventory Reports
  Jewellery Stock (Pieces & Weight)   Metal-wise Stock
  Purity-wise Stock                Category-wise Stock
  Design-wise Stock                Counter-wise Stock
  Stock Ageing                     Fast / Slow / Dead Stock

Purchase & Tax
  Purchase Register                GST Summary

Customer & Karigar
  Customer Purchase History        Top / Repeat Customers
  Birthday & Anniversary           Karigar Outstanding
  Old Gold Exchange Register       Custom Order Register
  Repair Register

System
  JadePro Setup / Install          Setup Checklist (print)
  Role Setup                       Salesperson Targets
  About JadePro
```

Added with the documented `Add: Item:` modifier on `Gateway of Tally`; **no
standard Tally menu is altered, hidden or reordered.**

---

## 7. Report structure

24 reports. All are SQL-backed `Collection: Report`s, which is what makes them
scale: Tally executes the query in its own engine instead of calling TDL
functions row by row.

Every report has: **From/To date filter**, **secondary filters**, **`Key:`
(Alt+K search)**, **F5 print**, **Alt+E Excel export**, **totals row**, and
**profit/cost columns gated behind `JADE_VIEW_PROFIT`**.

| # | Report | Source table | Source module |
|---|---|---|---|
| 1 | Daily Sales | `$$VOUCHERS$$` | 11 |
| 2 | Monthly Sales (12 rows, SQL-grouped) | `$$VOUCHERS$$` | 11 |
| 3 | Sales Register (per piece, per weight) | `$$LINEITEMS$$` | 11 |
| 4 | Purchase Register | `$$LINEITEMS$$` | 11 |
| 5 | GST Summary | `$$LINEITEMS$$` (GST ledgers) | 11 |
| 6 | Jewellery Stock (pieces + weight) | `$$ITEMSSTOCK$$` | 11 |
| 7 | Metal-wise Stock | `$$ITEMSSTOCK$$` | 11 |
| 8 | Purity-wise Stock (with fine weight) | `$$ITEMSSTOCK$$` | 11 |
| 9 | Category-wise Stock (with % of value) | `$$ITEMSSTOCK$$` | 11 |
| 10 | Design-wise Stock | `$$ITEMSSTOCK$$` | 11 |
| 11 | Counter-wise Stock | `$$ITEMSSTOCK$$` | 11 |
| 12 | Stock Ageing (dead stock buckets) | `$$LINEITEMS$$` | 11 |
| 13 | Movement (fast / slow / dead) | `$$LINEITEMS$$` | 11 |
| 14 | Salesperson Performance (vs target) | `$$LINEITEMS$$` | 11 |
| 15 | Item Profitability | `$$LINEITEMS$$` | 11 |
| 16 | Category Profitability | `$$LINEITEMS$$` | 11 |
| 17 | Customer Purchase History | `$$LINEITEMS$$` | 11 |
| 18 | Top / Repeat Customers | `$$LINEITEMS$$` | 11 |
| 19 | Birthday & Anniversary CRM | `$$CREATENMASTER$$` | 11 |
| 20 | Old Gold Exchange Register | `$$JOURNAL$$` | 11 |
| 21 | Karigar Outstanding | `$$JOURNAL$$` | 07 |
| 22 | Custom Order Register | `$$JOURNAL$$` | 09 |
| 23 | Repair Register | `$$JOURNAL$$` | 10 |
| 24 | Barcode / Tag Register | `$$ITEMS$$` | 08 |
| — | Dashboard 1–4 | four sources | 12 |

### The dashboard is four reports — and why

A TDL Report binds to exactly **one** data source, and the dashboard needs
four: voucher-level (money), line-level (grams and rankings), journal-level
(orders/repairs/karigar) and item-level (stock). Tally Prime's TDL cannot merge
independent SQL result sets onto one screen. Rather than ship a single screen
that quietly shows half the numbers, JadePro delivers four card reports with
one shared visual template. This is a platform limit, stated plainly.

---

## 8. Database and data flow

### 8.1 Where data lives

| Data | Storage | Why there |
|---|---|---|
| Jewellery attributes per item | Item UDFs | Item-level facts; reportable with SQL, and travel with the item. |
| Computed values (metal value, final value…) | Item UDFs | Stored once so inventory reports never re-derive and never drift. |
| Per-piece invoice data | Sales/Purchase line UDFs | Repeat per inventory entry — this is what allows multiple distinct pieces on one invoice. |
| Header totals, GST, payments | Voucher UDFs | One per voucher. |
| Daily metal rates | `RateMaster` journal | A journal is a date-stamped, audit-trailed, user-attributed record. |
| Old gold, karigar, order, repair | Tagged journals | Same, plus they post to real ledgers. |
| Customer CRM | Ledger UDFs | CRM attributes belong to the customer master. |
| Configurable business rules | Company UDFs | Discount ceiling, GST default, old-gold deduction, roles, targets. |

### 8.2 Write path (a sale)

```
Cashier picks the item in the Sales voucher
        │
        ▼
JpLnFromItemGroup copies barcode, HUID, purity, metal, weights,
stone rate, diamond rate, wastage %, making type from the ITEM
        │
        ▼
JpLineRate picks the rate:  item rate → today's rate master
                 (a typed rate wins only with JADE_OVERRIDE_RATE)
        │
        ▼
JpLnCalcGroup derives net weight, metal value, wastage, stone
value, diamond value, making charge, base value, discount,
taxable value, line total
        │
        ▼
JpSalesHdrCalcGroup sums payments and computes balance due
JpSalesTaxGroup splits GST into CGST / SGST / IGST and the grand total
        │
        ▼
Tally's own engine posts the party ledger, GST ledgers and the
inventory journal → stock falls by weight
        │
        ▼
F5 → JadePro invoice (14_PrintInvoice.tdl) with the old-gold
annexure if JwlOldGoldRef is set
```

### 8.3 Read path

Reports read Tally's tables directly through SQL. Nothing is copied into a
parallel database, so there is no synchronisation job to fail and no chance of
the reports disagreeing with the books.

### 8.4 Calculated columns on stock

Stock value is **hybrid**, as agreed:

```
Metal   : Net Weight × the purity's rate on the item
Stones  : Stone Weight × the item's stone rate
Diamond : Carat × the item's diamond rate
```

Metal follows the market; stones follow what the shop paid. The two never
double-count because they are separate columns with separate sums.

---

## 9. Validation rules implemented

| Rule | Where | Behaviour |
|---|---|---|
| Missing weight | `JpWeightValid` | Blocks. Rejects ≤ 0 and > 10,000 g as a typo. |
| Invalid purity | `JpPurityValid` | Blocks with the fineness table shown. |
| Stone > gross | `JpNetWeight` | Net clamps to ≥ 0 and Old Gold/Repair screens raise an explicit error. |
| Missing daily rate | `JpRateAvailable` | Blocks the line and names the metal + purity missing. |
| Duplicate barcode | `JpIsUniqueText` | Warns on the line. |
| Duplicate HUID | `JpLineValid` | Warns on the line. |
| Negative stock | — | Delegated to Tally's own negative-stock setting (Set in Company > Inventory). |
| Received > issued (karigar) | `JpJobValidationText` | Blocks — metal cannot be created. |
| Advance > expected price | `JpOrdValidationText` | Blocks. |
| Deliver with balance due | `JpRepValidationText` | Blocks. |
| Payment split < grand total | `JpSalesValidationText` | Blocks, showing the shortfall. |
| Rate inconsistency (22K > 24K) | `JpRateConsistency` | Blocks the mandatory fields, warns on the rest. |
| Value below MSP / above MRP | `JpItemValidationText` | Warning. |

> **On duplicate barcode / HUID:** Tally cannot index custom fields, so a true
> uniqueness constraint is not expressible in TDL. `JpIsUniqueText()` is the
> hook where it would be enforced; today it validates format and is the single
> place to add a lookup. The **Barcode / Tag Register** report gives you the
> offline reconciliation.

---

## 10. Security matrix

Tally has no concept of a role, so each Tally user is mapped to a JadePro role
once, on the Company master (`User|Role|User|Role`, e.g.
`Owner,Owner|Meera,Manager|Ravi,Salesperson|Priya,Cashier`).

| Right | Owner | Manager | Accountant | Salesperson | Cashier |
|---|:--:|:--:|:--:|:--:|:--:|
| `JADE_CHANGE_RATE` | ✔ | ✔ | ✔ | ✘ | ✘ |
| `JADE_OVERRIDE_RATE` | ✔ | ✔ | ✘ | ✘ | ✘ |
| `JADE_HIGH_DISCOUNT` | ✔ | ✔ | ✘ | ✘ | ✘ |
| `JADE_DELETE_VOUCHER` | ✔ | ✔ | ✔ | ✘ | ✘ |
| `JADE_VIEW_PROFIT` | ✔ | ✔ | ✘ | ✘ | ✘ |
| `JADE_PURCHASE` | ✔ | ✔ | ✔ | ✘ | ✘ |
| `JADE_KARIGAR_MGMT` | ✔ | ✔ | ✔ | ✘ | ✘ |
| `JADE_REPORTS` | ✔ | ✔ | ✔ | ✘ | ✘ |
| `JADE_COUNTER_CLOSE` | ✔ | ✔ | ✔ | ✔ | ✔ |

**A Salesperson cannot see cost price or profit.** The `Cost` column exists in
the data model but its grid field is `Invisible: ##JwlShowCost <> 1`, and
profit reports render `0` without the right.

### Fail-safe behaviour, stated explicitly

If the active Tally user **cannot be detected**, or has **no mapping**, the
module runs in an explicitly flagged *unassigned* mode: full access **plus a
visible warning on every screen**. It does not fail closed.

This is a deliberate decision. Failing closed would mean that if a Tally
release changed the user variable, nobody could open the rate master and the
shop would stop trading. Failing open with a loud warning keeps the business
running and makes the misconfiguration obvious. Set up the role map on day one
and this never applies.

---

## 11. Verification status — read this before loading

### 11.1 What was verified, and how

No Tally installation exists on this machine, so **JadePro has never been
compiled or run by Tally**. Claiming otherwise would be false. What was done
instead is a purpose-built static checker, [`00_Build/lint.mjs`](00_Build/lint.mjs),
run over every module on every build. It enforces:

1. `[ … ]` brackets balance across the whole file set.
2. Every line-level keyword is in a curated TDL attribute vocabulary — catches
   `Partt-id:`, `Columms:`, and similar typos.
3. Every referenced symbol (`Part Name:`, `Print:`, `OnAction:`, menu targets,
   report dependencies) is declared somewhere in the module set.
4. No duplicate declarations. *(This caught three real defects: duplicate
   `Alter: Sales Voucher` blocks in `04_Sales.tdl` and `Alter: Ledger` in two
   modules — both are hard TDL errors.)*
5. No `System: UDF` is declared twice. *(Duplicate UDFs are silently dropped by
   Tally, which produces the bewildering symptom "I changed the value and
   nothing happened".)*
6. Every UDF referenced in a form or report is declared. *(This caught four
   genuine defects: `$$JwlRateOverridden` referenced a variable that is
   actually called `JpRateOverridden`, and four report columns referenced
   fields the SQL never produced.)*
7. The generated bundle has no duplicate sections across module boundaries.
8. A repeated singular attribute inside one section (two `Var:` lines, two
   `Filters:` lines) is flagged — Tally silently keeps one of them. *(This
   caught five stock reports whose shared date filter had been duplicated.)*
9. Every `Display:` target in the gateway menu resolves to a declared report or
   screen, so no menu item can dead-end.
10. Every module in `tdl/` is present in the bundle. The expected set is read
    from the directory rather than hard-coded, because a literal module count
    silently rots the next time a module is added — which is exactly how
    `08a`/`08b` shipped without being bundled at first.
11. `build.sh` reads `coverage.mjs`'s exit status from a buffered file, not a
    pipe. In a pipeline `$?` is the status of the *last* command, so
    `coverage.mjs | tail -3` reported `tail`'s status and let coverage failures
    through. Both directions were re-tested after the fix.

A second checker, [`00_Build/coverage.mjs`](00_Build/coverage.mjs), asserts the
delivered TDL against the **32 requirement areas of the original brief** —
every named UDF (asserted as a real `System: UDF` declaration, not merely a
reference), every named function, every report, every payment mode, every order
and repair status, and that **every gateway menu target resolves to a real
report or screen**. It runs as part of every build.

Both checkers were themselves tested by injecting six defects — unclosed
bracket, duplicate UDF, duplicate `Alter:` section, duplicate function across a
module boundary, an undeclared UDF, and a dangling menu target — and each was
caught with a non-zero exit. `build.sh` stops at the first failing gate.

A third layer covers the pipeline itself, added after the barcode modules
exposed gaps in it. Each was proven non-vacuous by deliberately breaking it:

| Defect found | How it is now caught |
|---|---|
| `coverage.mjs` ran through `\| tail -3`, so `$?` was `tail`'s status and coverage failures passed silently | Buffered to a temp file; exit status read directly. Tested with a stub that exits 1 (build stops) and one that exits 0 (build proceeds). |
| `08a`/`08b` were added to `tdl/` but not to `build.sh`'s `ORDER`, so they were linted yet never bundled | `lint-bundle.mjs` compares the bundle against the contents of `tdl/` instead of a hard-coded count. Removing a module from `ORDER` now fails the build. |
| `lint-bundle.mjs` hard-coded "expected 16 modules" | Replaced by the directory comparison above. |
| Emitter accepted a CSV row whose field count differed from the header, shifting every geometry column after the break | Hard error, `--lenient` to downgrade. |
| Default label profile had `shopY == itemY`, printing two fields on one line | Layout self-check warns on any intersecting field bands. |
| `--profile` was documented as highest precedence but the CSV overrode it, so passing a 300 dpi profile emitted 203 dpi labels | Precedence now enforced; unknown profile keys rejected with exit 2. |
| Neither print module actually called `JpBarcodeEnsure`, although three files' comments claimed they did — an unbarcoded piece exported empty and was skipped | Added a real `Mint Barcode` action to both modules, gated on a new `JADE_BARCODE` right, and corrected the comments. |

### 11.1a The barcode print path

Three modules, loaded in this order, so that either print path can be enabled
without the other:

```
08_Barcode.tdl     mint + store the barcode ONCE  (JpBarcodeEnsure)
   +-- 08a_BarcodeTally.tdl   Tally print engine  -> PDF / paper
   +-- 08b_BarcodeZPL.tdl     label specification -> CSV
                               00_Build/zpl-emit.mjs  -> .zpl files -> Zebra
```

`JpBarcodeEnsure(vItem, vSerial)` returns the stored `JwlBarcode` if it is
valid and otherwise mints one. It is **idempotent and never regenerates**, so
re-printing a tag cannot change the number already on the shelf.

**Printing never writes.** Both print modules only *read* the stored value —
which is what guarantees the Tally tag and the Zebra label carry the identical
barcode. Minting a *missing* value is a separate, deliberate operator action
(`Mint Barcode`, F3, on each screen) that calls `JpBarcodeEnsure()`. This split
is deliberate on both counts: TDL print formats cannot invoke functions, and
mutating masters as a side effect of rendering a report is not acceptable in a
system where a tag may be re-rendered many times. It is gated behind the
`JADE_BARCODE` right (Owner, Manager, Accountant) because it writes to the item
master.

Scheme: `JPL-<CAT3>-<DESIGN6>-<WT3mm>-<SER3>` — e.g. `JPL-RNG-D012345-012-004`.

**Why the Zebra half is a Node script.** A Zebra printer speaks ZPL II, not
PDF. Emitting ZPL requires writing a file to disk or opening a printer port,
and **TDL can do neither** — a Tally function can only reach Tally's print
engine or its XML request/response interface. This is a hard platform limit, not
a design shortcut. So `08b` parses the printer profile and exports the label
specification as CSV, and `00_Build/zpl-emit.mjs` performs the I/O. The column
contract between the two is documented in both files.

Geometry precedence: `--profile` JSON > CSV columns > built-in defaults. The
defaults target **203 dpi, 54 × 40 mm, darkness 12, speed 4, 1 copy**, and every
field origin is a separate setting. 203 dpi is 8 dots/mm, so 54 mm = 432 dots
and 40 mm = 320 dots.

Two guards earn their keep, because both failure modes print a *plausible but
wrong* label rather than an error:

- **`--profile` outranks the CSV.** A `profile.json` pinning `dpi`,
  `labelWidthMm`, `labelLengthMm`, `darkness`, `speed` or any field origin
  overrides the value in every row, so a different roll can be tried without
  re-exporting from Tally. Unknown keys are rejected rather than ignored. This
  precedence was originally documented but not implemented — the CSV silently
  won for every geometry it also carried, which is all of them.

- **Ragged CSV rows are a hard error.** An unquoted `"MRP Rs. 48,500.00"` adds a
  field, and every geometry column after it shifts — dpi becomes the MRP
  decimal, darkness becomes the label length. `--lenient` downgrades to a warning.
- **Overlapping field positions are reported.** The default profile once had
  `shopY == itemY == 28`, which printed the shop name and the item name on top
  of each other; the emitter now warns on any two fields whose bands intersect,
  or on content running past the bottom of the label.

**Current status: 0 lint errors, 0 warnings, 32/32 requirement areas covered,
2,492 sections (1,585 of them `[Line:]`), 219 UDFs, 13,041 lines.**

### 11.2 The constructs to confirm on your build

**T0027, found by a real compile — and the first fix was wrong.** The first load
into Tally Prime failed with `error T0027: The attribute definition started
without a valid definition`. The initial diagnosis was that TDL has no *numeric*
constant type, so the 18 unquoted values were quoted. That treated a symptom:
the error merely moved to the next `Constant:` line.

The real cause is that **`Constant:` is not a TDL definition type at all**. The
official TDL Reference lists the definition types as Menu, Report, Form, Part,
Line, Field, Button, Table, Object, Variable, Collection, Border, Style, Color,
Import Object, Import File, Key and System definitions, and states that "all
definitions start with an open square bracket and end with a closed bracket". A
top-level `Constant: X : "v"` is therefore an attribute line with no owning
definition, quoted or not.

All 43 constants were converted to zero-argument functions by
`00_Build/constant-to-function.mjs`, which rewrites

    Constant: JpFine24 : "0.999"     ->     Function: JpFine24 / Type: String
                                                  / Returns: String : Any
                                                  / JpFine24 = "0.999"

and adds `()` at every use site, skipping string literals and comments so
display text is untouched. `00_Build/verify-migration.mjs` diffs the result
against `.tdl-backup/` and proves every changed line is either one of the 43
Constant declarations or one of 86 call-site rewrites — 0 unexplained. Numeric
uses keep their `Number(...)` wrapping, which is still required now that the
value is a function returning a string. `lint.mjs` now rejects any `Constant:`
line outright, proven non-vacuous by injection.

**T0027 again: definitions must be bracketed.** With `Constant:` gone, the same
error appeared at the same line — now `Function: JpAppName`. That is the same
signature, and it identified the systemic cause: JadePro had been written almost
entirely in the unbracketed style. The official TDL Reference is explicit —
*"All definitions start with an open square bracket and end with a closed
bracket"*, syntax `[<Definition Type> : <Definition Name>]` — and 611 of 693
definitions were unbracketed.

`00_Build/bracket-definitions.mjs` wrapped all 611 (Function 259, Variable 228,
Collection 74, Style 21, Screen 15, Alter 8, Report 4, Barcode 2). Attribute lines
at column 0 (`Print:`, `Part:`, `Export:`, `Keys:`, `End:`) were deliberately
left bare — they are attributes of the definition above them, not definitions.
`00_Build/verify-bracketing.mjs` asserts zero unbracketed definitions, zero
wrongly-bracketed attributes, no double brackets and balanced depth per file.

**Column-0 definitions the first pass missed.** The bracketing script excluded
`Print`, `Part`, `Export` and `Keys`, assuming they were attributes of the
definition above. Inspecting [01_Main.tdl](01_Main.tdl) disproved that: line 206
is the *indented* attribute `Print: JpAboutPrint` inside the Report, while line
208 opens a **second, separate definition** of the same name whose body contains
`Lines: 1, 1, 1, ...` — a part/print layout, which a Report does not have. At
column 0 after an indented block these parse as top-level statements with no
definition, the same fault that produced T0027 at line 66.

`00_Build/fix-col0-definitions.mjs` bracketed all 85 (Print 35, Export 30, Part
17, Keys 3) and removed the 32 `End:` lines. `End:` is neither a TDL definition
type nor a documented attribute, and bracketed definitions are self-delimiting,
so it has no role. `verify-bracketing.mjs` now asserts none of these keywords
appear at column 0 unbracketed and that `End:` never appears at all.

**T0011: the User Defined Field declarations were wrong.** Tally reached line 1218
and reported `The system definition type 'UDF "JwlJadeProOn"' is invalid` — it
had parsed the whole bracket as the *definition type*, because the name must not
live inside the brackets. The documented form is:

```tdl
[System: UDF]
JwlJadeProOn : Logical : 20001
```

Three further errors surfaced in the same area, all of them mine:

- **Index numbers are mandatory.** Allocated sequentially from 20001; the
  reference reserves 1-29 for default TDL and 10000-20000 for TSPL.
- **`Text` is not a Tally data type.** The valid set is String, Amount,
  Quantity, Rate, Number, Date, Rate of Exchange, Logical. All 83 `Text`
  declarations became `String`.
- **A UDF is read with a single `$`.** `$$Name` addresses a *Variable*. 622
  expression references were converted. `$` reads a UDF in the current object,
  `##Name` in the Company context, `$$Name` a variable; the 351 `$$Jwl*` names
  that remain are collection-derived **variables** and are correct as they are.
  SQL collection syntax inside quoted strings (`$$JwlBarcode$$`) is a different
  grammar entirely and was preserved byte-for-byte.

**This was a data-model bug, not just syntax.** Reading UDFs as variables meant
weights, purity, HUID and MRP were never stored against the item or the voucher,
so the per-piece jewellery model was inert. It is now wired to real Tally
storage, which is what the 20-point brief depends on.

Four checkers needed updating for the new declaration form. One was genuinely
wrong: `lint-bundle.mjs` flagged duplicate `[System: UDF]` blocks, but the
reference states *"System Definitions can be defined any number of times. The
items defined are appended to the existing list."* The UDF-shape pattern also
needed the same `[System: UDF]` context guard in both checkers, or an unrelated
attribute such as `Set : Var : 123` is misread as a declaration — proven by
injecting one and confirming the UDF count does not move. Both the `Constant:` and the
`Function:` error were reported at line 66 even though that line's content
changed between loads, which looked like Tally caching the error rather than
re-parsing. **That theory was wrong.** Once bracketing was applied Tally advanced
past line 66 and reported a different code at a different line, proving it had
been re-parsing throughout. Bracketing was applied anyway because it is
documented-correct TDL regardless, so it could not have made things worse.

**T0014: `Type:` is not an attribute of a Function.** With bracketing in place,
Tally reached line 67 and reported
`error T0014: Incorrect attribute 'Type' is used for the definition 'Function'`.
`Type:` belongs to `Variable`, `Field` and `Object` definitions; a Function
declares its result through `Returns:`. All 251 `Type:` lines inside
`[Function: ...]` blocks were removed by `00_Build/fix-function-type.mjs`; the
305 on Variable/Field/Object were preserved.

The removal was checked for data loss before applying: **all 259 functions carry
both `Type:` and `Returns:`**, and zero have `Type:` without `Returns:`, so no
type information is lost. `lint.mjs` now flags a `Type:` inside a Function block,
proven non-vacuous by injection.
claimed that setting `JpUseTdlBarcode` to 0 made the `Barcode:` sections
"inert". That was wrong: TDL parses an entire function before executing any of
it, so an unrecognised `Barcode:` section would have stopped the whole load. The
sections now live in `tdl/08c_BarcodeSection.tdl`, which is deliberately **not**
bundled and is listed as an explicit optional module in `lint-bundle.mjs`, so
the omission stays deliberate and visible. Enable PATH B by loading that file
and setting `JpUseTdlBarcode` to 1.

**A known gap in the linter, stated plainly:** the structural checker validates
that referenced symbols are declared, but it inspects `Part Name:`, `Print:`,
`OnAction:`, `Var:` and menu targets — it does **not** resolve identifiers
passed as bare *function arguments*. A mistyped `JpHasRight(JpRtCreate)` would
pass the linter and fail in Tally. Every `JpRt*` right identifier was therefore
checked by hand against `00_Core.tdl`, and all rights are now declared there
(`JpRtBarcode` was added for this reason).

Check these first, in this order. Each is a single place to look.

| # | What | Where | If it fails |
|---|---|---|---|
| 1 | `Part-id: Invoicemain` gives a UDF its own **column inside the inventory-entry grid** | `04_Sales.tdl` §D, `05_Purchase.tdl` §D | The per-piece jewellery columns do not appear on the Sales item grid. Fix: the internal part name for an inventory entry line differs on your build — change `Invoicemain` in those two files to the name Tally shows in your part editor. Everything else is unaffected. |
| 2 | `Alter: <Voucher>, Item Details` is the correct target for the item grid | `04_Sales.tdl`, `05_Purchase.tdl` | Same fix: change the target part name. |
| 3 | `$$UPCurrentUser` returns the signed-in Tally user | `13_Security.tdl` `JpDetectUser()` | Roles stay *unassigned* and every user has full access with the warning shown. Fix: substitute your build's user-name source in that one function. |
| 4 | The TDL `Barcode:` section syntax (`Barcode: <name>` / `Bar-Code: Code128`) | `08a_BarcodeTally.tdl` PATH B | The Tally-native tag prints the barcode value as text instead of bars. **This is the safe default, not a failure** — `JpUseTdlBarcode` is `0`, which uses the Code 128 *font* path that always renders scannable bars. Set it to `1` only after confirming your Tally build accepts the section; the two paths are otherwise identical. |

Each is a **single-line change**. Nothing else in the system depends on them.

### 11.3 Other known limits

- **Voucher deletion** cannot be blocked from TDL. The permission exists and is
  enforced everywhere TDL can act; enforce it operationally through Tally's own
  *Security → Rights → Voucher Type Creation/Deletion* rights.
- **`Create: VoucherType:`** is not a supported TDL action, which is why §3 needs
  no voucher types.
- **Sales register drill-down** to the original voucher uses `Key:` (Alt+K) to
  locate the voucher by number. A click-through `Link:` on a dynamic grid cell
  needs Tally's drill-down object and is not wired up.
- **Cancelled orders and repairs** post a reversing journal you create in
  Tally; JadePro tracks the status but does not auto-generate the reversal.

---

## 12. Scalability

| Concern | Approach | Result |
|---|---|---|
| Thousands of jewellery items | Masters use `Modify Group`, never row iteration | O(1) per master |
| Reports over large ledgers | Every report is one SQL query | One indexed scan, not N TDL calls |
| Aggregation | `GROUP BY` in SQL, not in TDL | Monthly sales = 12 rows for a year, not 3,000 |
| Multi-line invoices | Fields attach to the inventory entry part | Unlimited pieces per bill |
| Printing | Print formats reference fields, not data sets | No per-row overhead |
| Search | `Key:` on every report | Alt+K instant lookup |

---

## 13. Build and load

```bash
bash 00_Build/build.sh        # lints, checks spec coverage, bundles, verifies
```

The build runs three gates and stops on the first failure:
[`lint.mjs`](00_Build/lint.mjs) → [`coverage.mjs`](00_Build/coverage.mjs) →
[`lint-bundle.mjs`](00_Build/lint-bundle.mjs).

**In Tally Prime:** F11 (Alter) → Manage TDL Functions → Create New Function →
Load → select `JadePro.tdl` → Done.

**Recommended: load the modules individually** in numbered order rather than the
bundle. If a module fails, you isolate it in one step instead of sixteen.

**Then, in this order:** Setup / Install → F2 create masters → Role Setup →
Daily Rate Master → one test invoice, checked by hand against your own
calculation.