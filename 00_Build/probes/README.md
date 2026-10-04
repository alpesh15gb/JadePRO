# TDL probe suite — 12 files, one reload, twelve answers

Tally stops at the **first** syntax error in a file, which is why fixing `JadePro.tdl`
one error per reload is so slow. But TDL Management compiles each **configured file
independently** and shows a status row per file. So instead of one construct per reload,
put all twelve here and get all twelve verdicts at once.

## How to run

1. Tally Prime → **F11** (TDL Management) → *Modify*.
2. Remove `JadePro.tdl` from the list if you want a clean read — but **keep** `p00`–`p12`
   below.
3. Add all the `.tdl` files in **this folder**. Order does not matter; each file is
   self-contained and every name is prefixed `ZzP` so nothing can collide.
4. Read the **Status** column:

| Status          | Meaning |
|-----------------|---------|
| `Loaded`        | The construct is valid TDL. Use that form. |
| `Not loaded (Error)` | Read the Error Message — it names the file, line and error code. |

An empty Status cell for `p00` means the harness itself is broken and nothing else in
the list can be trusted.

## What each file decides

| File | Question | Why it matters |
|------|----------|----------------|
| `p00_control.tdl` | Does a minimal Function/Screen/Report load? | Control. Must be `Loaded`. If this fails, the suite is mis-built. |
| `p01_alter_unbracketed_1arg.tdl` | Is `Alter: Company` (unbracketed) valid? | **The current T0006 blocker.** This is the form the original sources used. |
| `p02_alter_bracketed_1arg.tdl` | Is `[Alter: Company]` valid? | Expected to fail — it is what produced `T0006 ... definition type is misspelt`. Confirms p01 by contrast. |
| `p03_alter_unbracketed_2arg.tdl` | Is `Alter: Item, ZzP03Grp` valid? | Used twice in `02_ItemMaster.tdl`. |
| `p04_alter_bracketed_2arg.tdl` | Is `[Alter: Item, ZzP04Grp]` valid? | If `Loaded`, two-arg Alter *is* a definition and the fix must be per-site, not blanket. |
| `p05_print.tdl` | Is `[Print:]` a real definition? | **PATH A barcode printing depends on it.** No reference page documents `[Print:]`. |
| `p06_export.tdl` | Is `[Export:]` + `Export: Value:` real? | **Decides the Zebra ZPL pipeline.** If invalid, the CSV has to come from elsewhere — a redesign, not a syntax patch. |
| `p07_keys.tdl` | Is `[Keys:]` real? | Menu accelerators. 3 blocks in `01_Main.tdl`. |
| `p08_barcode.tdl` | Is `[Barcode:]` real? | PATH B, native TDL Code 128. Currently quarantined in `08c_BarcodeSection.tdl`. |
| `p09_upcurrentuser.tdl` | Is `$$UPCurrentUser` valid? | Permission gating in `13_Security.tdl`. |
| `p10_partid_invoicemain.tdl` | Is `Part-id: Invoicemain` valid? | 9 uses in `04_Sales.tdl`. Needs the *unbracketed* 2-arg Alter to parse first. |
| `p12_fieldgroup_modify.tdl` | Are `Add: Field Group:` + `Modify Group:` valid? | The Item-module calculation group — the densest unproven area in the bundle. |

## Why each file is safe to load

`p01`–`p04`, `p10` and `p12` do technically `Alter` real masters (Company, Item,
Sales Voucher). They only `Add:` a single `Logical` field with an obscure `ZzP..` id and
`Value: No`. That field is invisible unless another screen references it, nothing in
JadePro references it, and it stores `No`. Company `100000` has no data in it anyway
(Tally returned an empty Balance Sheet skeleton). To remove them afterwards, delete the
files from TDL Management and reload; the added fields go with them.

## Reading the result

Send back the whole list. The verdicts are not independent — for example `p10` can only
pass if `p03`-style unbracketed 2-arg Alter parses — so the set collapses to a small
number of design decisions:

- `p01` pass → revert `Alter:` everywhere (already done, pending confirmation).
- `p05` fail → barcode printing must move to `Print:`-free rendering.
- `p06` fail → the ZPL emitter needs a different data source than a TDL `Export:`.
---

# Batch 2 — routing (p20–p33)

Added after the Line-layer migration. `lint-attributes.mjs` cut the `[Line:]`
bucket from 1,903 misrouted attributes to 90, and it is these fourteen files
that decide what the remaining 1,111 become. One F11 load, fourteen verdicts.

| File | Question | Decides |
|------|----------|---------|
| `p20_control.tdl` | Canonical Report→Form→Part→Line→Field chain loads? | **Control.** Must be `Loaded`. |
| `p21_field_setas.tdl` | Is `Set As : "literal"` how a Field renders text? | The 838 `Text:` → `Set As` conversions. |
| `p22_field_storage.tdl` | Is `Storage : <UDF>` how a Field reads a UDF? | The 84 `Field-Id:` → `Storage` conversions. |
| `p23_field_label.tdl` | Is `Label : "..."` an attribute of Field? | The **last 84** misrouted attributes. |
| `p24_field_format.tdl` | Width / Style / Align / Color / Format / Dynamic / Skip on Field | 824 moved attributes. |
| `p25_style_only4.tdl` | Style = Font, Height, Bold, Italic only | `Font: BOLD` → `Bold: Yes`; moves Colour/Border to Field. |
| `p26_function_params.tdl` | `Parameter :` + `100 : Return :` | 471 `Var:`/`Param:`/`Returns:` sites. |
| `p27_function_statements.tdl` | `NNN : Action :` numbered statements | 165 `Add:`/`Create:`/`Alter:`/`Accept:` sites. |
| `p28_print_as_report.tdl` | Is a print layout a Report with `Print :`? | The rewrite of **35 `[Print:]` blocks**. |
| `p29_export_as_report.tdl` | Is output a Report with `Plain XML` + `XMLTag`? | The rewrite of **30 `[Export:]` blocks**; also tests `XMLTag` on Part. |
| `p30_screen_as_report.tdl` | "Every screen is a Report definition" in practice? | The rewrite of **15 `[Screen:]` blocks**. |
| `p31_keys.tdl` | Is `[Keys:]` a definition type? | 3 blocks. |
| `p32_part_lines_alias.tdl` | `Lines:` takes names, never a count | 34 `Lines: 1, 1, 1` layouts. |
| `p33_line_explode.tdl` | `Explode : <Part> : <cond>` on a Line | The 22 invented `Part Name:` attributes. |

## Reading batch 2

Every file here only *defines* things — nothing is altered, no master is
touched, nothing is stored. Load and remove them freely.

The verdicts collapse to four decisions:

1. **p20 fails** → the harness is wrong; ignore the rest and report the error.
2. **p21–p25 pass** → batch 1's migration is correct as shipped.
3. **p26 or p27 pass** → the 647 Function attributes can be rewritten mechanically.
4. **p28–p33 pass** → the 83 non-existent definition types can be rewritten.

If p23 fails, `Label` goes to a `[Field:]`-adjacent construct or is dropped; if
p22 fails, `Storage` is wrong and the UDF read syntax needs a different route.
