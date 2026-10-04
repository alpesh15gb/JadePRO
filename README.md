# JadePro Jewellery ERP for Tally Prime

A complete jewellery-retail module set for Tally Prime — item master, daily
metal rates, jewellery sales and purchase, old gold exchange, karigar job work,
barcode tags (Tally-native Code 128 **and** Zebra ZPL), custom orders, repairs,
a business dashboard, 24 drill-down reports, role-based security and a premium
invoice print.

**13,041 lines · 18 modules · 219 UDFs · 19 reports/screens · 0 lint errors · 32/32 requirement areas**

> Read **[ARCHITECTURE.md](ARCHITECTURE.md)** — especially **§11 Verification
> status**, which states exactly what has and has not been proven.

---

## Quick start

```bash
bash 00_Build/build.sh      # lint → spec coverage → bundle → verify
```

### In Tally Prime

1. `F11` (Tally Prime → Alter → Manage TDL Functions) → **Create New Function**
2. **Load** → select `JadePro.tdl` → **Done**

**Better: load the 18 files from `tdl/` individually, in numbered order.** If
one module misbehaves you isolate it in a single step instead of eighteen.
`00_Core.tdl` must always load first — it holds the function library.

### Then, in this order

| Step | Where | Why |
|---|---|---|
| 1 | Gateway → Settings → **Enable JadePro Jewellery**, fill shop name, GSTIN, state | Invoice letterhead, CGST/IGST decision |
| 2 | Jewellery → System → **JadePro Setup / Install** → F2 | Creates 5 groups, 14 ledgers, 3 godowns |
| 3 | Jewellery → System → **Role Setup** | Maps Tally users → roles. **Do not skip** |
| 4 | Set every jewellery item's **UOM to GMS** | Weight reports read the Tally inventory quantity |
| 5 | Jewellery → **Daily Gold / Silver Rate** | Required before the first bill of the day |
| 6 | Jewellery → System → **Setup Checklist** (print) | Ten boxes to tick before you trade |

**JadePro does not touch Tally's GST setup.** Tax ledgers and percentages stay
in Tally's own Taxes & GST configuration so the statutory reports remain
correct. JadePro *reads* Tally's tax; it never restates it.

---

## Layout

```
tdl/                    18 loadable modules, in load order
  00_Core.tdl           calculation · rate · validation · security library
  01_Main.tdl           Gateway menu · Company settings · About
  02_ItemMaster.tdl     30 item UDFs · Alter Item · Create Item
  03_GoldRate.tdl       daily 24K/22K/18K/14K/Silver/Platinum rates
  04_Sales.tdl          jewellery sales header + per-piece grid + GST + payments
  05_Purchase.tdl       jewellery purchase header + per-piece grid
  06_OldGold.tdl        old gold exchange · fine weight · deduction
  07_Karigar.tdl        karigar master · job work · outstanding report
  08_Barcode.tdl        barcode scheme · jewellery tag · tag register
  08a_BarcodeTally.tdl  Tally-native Code 128 tag printing + bulk tags
  08b_BarcodeZPL.tdl    Zebra label profile · setup · print queue · CSV export
  09_Orders.tdl         custom order lifecycle · register
  10_Repairs.tdl        repair lifecycle · register
  11_Reports.tdl        CRM block · 20 drill-down reports
  12_Dashboard.tdl      four dashboard card reports
  13_Security.tdl       role rights · user mapping · sales targets
  14_PrintInvoice.tdl   premium invoice print · old-gold annexure
  15_Install.tdl        master setup · setup checklist

  08c_BarcodeSection.tdl  OPTIONAL - TDL Barcode: section for PATH B.
                          Not in the default bundle; see the file header.

JadePro.tdl             generated bundle (do not hand-edit)
ARCHITECTURE.md         design record — UDFs, masters, logic, limits
00_Build/               lint.mjs · lint-bundle.mjs · build.sh · tdl-attrs.mjs
                        zpl-emit.mjs · zpl-sample.csv
```

---

## The five things worth knowing

**1. Standard vouchers, not custom voucher types.** Sales and purchase post to
Tally's own voucher and ledgers, so GST returns, banking, reconciliation and
inventory all keep working. The custom events (rate master, old gold, karigar,
order, repair) are tagged journals posting to real ledgers. See ARCHITECTURE §1.1.

**2. No tax percentage is written anywhere in this codebase.** The GST rate is
data — on the voucher, fed from your own rate masters. Change a slab in Tally;
don't edit TDL.

**3. Every piece gets its own row, stored as real UDFs.** Per-piece weights,
rate, making charges, wastage, HUID and discount live on the inventory entry
line as Tally User Defined Fields, which is what makes a multi-piece jewellery
invoice with per-piece HUIDs possible. (Getting this right was the last real
defect: UDFs were originally declared and read with variable syntax, so nothing
was actually persisted.)

**4. Cost and profit are hidden from Salespeople.** The columns exist in the
data model; the grid fields and report cells are gated behind
`JADE_VIEW_PROFIT`.

**5. JadePro is being compiled by Tally, iteratively.** Early versions failed
their first load with **T0027** twice, then **T0014**, then **T0011**, and every
cause was structural rather than cosmetic: `Constant:` is not a TDL definition
type at all; TDL requires **every definition to be bracketed**
(`[Function: Name]`), and the codebase was 97% unbracketed; `Type:` is not a
valid attribute of a Function; and the User Defined Fields were declared and
read with *variable* syntax, so no per-piece data was ever stored. All four are
fixed (43 constants became functions, 696 definitions bracketed, 251 `Type:`
lines removed, 219 UDFs re-declared in the documented `Name : Type : Index`
form) and the checkers now reject each pattern. Two checkers plus two
migration verifiers run on every build; each is tested by injecting known
defects and confirming the build fails. See ARCHITECTURE §11.1.

---

## Menu

`Gateway of Tally → Jewellery`

Daily Operations · Masters · Barcode & Labels · Dashboard (4 cards) · Sales
Reports · Inventory Reports · Purchase & Tax · Customer & Karigar · System

---

## Barcodes

`08_Barcode.tdl` mints the barcode once, stores it on the item, and never
regenerates it (`JpBarcodeEnsure`). Both print modules read that same stored
value, so the Tally-printed tag and the Zebra label can never disagree:

```
JPL-<CAT3>-<DESIGN6>-<WT3mm>-<SER3>     e.g.  JPL-RNG-D012345-012-004
```

The two print modules are **independent** — load either, or both.

| Module | Printer | How |
|---|---|---|
| `08a_BarcodeTally.tdl` | Any printer Tally can drive (laser/inkjet) | Tally `Barcode:` section, Code 128. Set `JpUseTdlBarcode = 1` to switch from the font-based fallback |
| `08b_BarcodeZPL.tdl` + `00_Build/zpl-emit.mjs` | Zebra / ZPL label printers | 203 dpi first; label size, darkness, speed and every field position configurable |

**Zebra is deliberately two pieces, not one.** TDL cannot write a file to disk
or open a printer port — a Tally function can only reach Tally's print engine
(PDF/paper) or its XML interface. So Tally produces the label *specification*
(`Jewellery → Barcode & Labels → Zebra Label Print Queue` exports a CSV) and
`zpl-emit.mjs` does the file I/O:

```bash
# 1. In Tally: Zebra Label Print Queue -> Export -> labels.csv
# 2. Emit ZPL, one .zpl file per label:
node 00_Build/zpl-emit.mjs labels.csv -o ./zpl-out
```

Defaults target **203 dpi, 54 × 40 mm, darkness 12, speed 4** — a common
desktop unit. The profile lives on the Company master
(`JplZplSettings`, set from **Zebra Label Setup**) and is written into every
exported row, so changing it needs no edit to the script. Any dpi works.

Geometry precedence is **`--profile` JSON → CSV columns → built-in defaults**,
so you can try a different roll without re-exporting from Tally:

```bash
node 00_Build/zpl-emit.mjs labels.csv -o ./zpl-out -p my-printer.json
```

The emitter refuses to guess: a CSV row whose field count differs from the
header (an unquoted `"MRP Rs. 48,500.00"` is the usual cause) is a hard error,
and overlapping field positions are reported — a garbled label with no error is
the worst possible outcome at a live counter.

**Minting a barcode is a separate, deliberate action.** Printing only reads the
stored value, so a piece with no barcode would export empty and be skipped by
the emitter. Use **Mint Barcode (F3)** on either barcode screen; it calls the
shared, idempotent `JpBarcodeEnsure()`, which never renumbers a piece that
already has one. It is gated behind the `JADE_BARCODE` right (Owner, Manager,
Accountant).

---

## If something does not open

1. Unload the module: `F11` → Manage TDL Functions → select → **Remove**.
2. Reload **`00_Core.tdl` first**, then the rest in numeric order.
3. Run `bash 00_Build/build.sh` — it must print `OK - no structural errors`,
   `32/32 requirement areas covered` and `BUILD OK`.
4. Still stuck? Open `Jewellery → System → About JadePro`, which lists the
   loaded modules and the cached metal rates.

If only the **per-piece columns on the Sales item grid** are missing, that is
the `Part-id: Invoicemain` construct (ARCHITECTURE §11.2, item 1) — one line in
`04_Sales.tdl` and `05_Purchase.tdl`.