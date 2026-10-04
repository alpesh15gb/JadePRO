# TDL Prime — verified specification, and where JadePro departs from it

Source of truth: **TallyHelp → Developer Reference → Tally Definition Language**
(`help.tallysolutions.com`, pages last updated Aug–Sep 2026). This file records what
the documentation actually says, and maps every construct JadePro uses onto it.

It exists because we were previously inferring TDL syntax from compiler error messages,
one error per reload, and that method produced six defects in a row. Everything below
is quoted or directly derived from the reference, not guessed.

---

## 1. Definition types

TDL has **20 definition types** (the reference's own wording). The reference's table
of contents names these pages:

```
Border  Button  Collection  Color  COM Interface  Field  Form  Function
Import File  Import Object  Key Value Map  Line  Menu  Name Set  Notification
Object  Object Map  Part  Progress Bar  Query Box  Report  Resource  Rule Set
Style  System  Variable  Watermark  PDF
```

`Key` and `Button` are aliases of one another.

**Absent from that list:** `Alter`, `Barcode`, `Print`, `Export`, `Keys`, `Screen`,
`Constant`, `Table` (though *Table* is documented as an **alias of Collection**).

Every one of those absent names is used somewhere in JadePro. `Alter` has already
produced `T0006: The definition type is misspelt or incorrect` when bracketed, which
is exactly what an unknown definition type produces.

### Consequence

| JadePro uses | Documented equivalent | Status |
|---|---|---|
| `[Screen: X]` | `[Report: X]` + `Form:` | wrong — `Screen` is not a type |
| `[Print: X]` | `[Form: X]` referenced by a Report's `Print:` attribute | wrong — see §3 |
| `[Keys: X]` | `[Key: X]` | wrong — `Keys` is not a type |
| `[Barcode: X]` | *nothing* | undocumented — no barcode definition type exists |
| `[Export: X]` | *nothing* — see §6 | undocumented |
| `Alter: X / Add: Field` | `[Report: X] Object: X` + `[Field:] Storage:` — see §5 | wrong — ERP 9 era |

---

## 2. The containment hierarchy

> "In the order of the report interface structure which follows
> **Report -> Form > Part > Line > Field**, a line is an Interface Definition
> contained within a Part and it consists of one or more fields."

> "A Part acts as a container for one or more Parts or Lines… At the lowest level of
> this hierarchy, every Part must eventually contain one or more Lines."

> "The objects Form, Part, Line, Field can't exist independently. They must follow
> the containment hierarchy."

> "A Report itself does not define the layout. Instead, it references one or more
> Forms."

Also: *"Every screen that you interact with in TallyPrime… is represented by a Report
definition."* — so a "screen" is a Report. There is no `Screen` type to migrate to;
a screen is simply a Report whose Form is displayed.

### The `Lines:` trap

`Lines` is an **alias for `Line`**, not a count:

> "Lines is an alias for Line. Similarly Part/Parts/Top Parts, Field/Fields/Top
> Fields etc. are alias of the same attribute… the part PartOne contains two lines
> LineOne and LineTwo. This can be specified by providing the line names as
> attribute values for the attribute Line."

So `Lines: 1, 1, 1` declares three lines **named** `1`. JadePro used it as a count in
34 places. All of those are now generated explicitly.

---

## 3. Attribute vocabulary

Attributes are **per definition type**. An attribute valid on `Line` is not valid on
`Part`; using one where it does not belong is `T0014: Incorrect attribute 'X' is used
for the definition 'Y'`.

Each TallyHelp definition page publishes its attributes as a **grouped list**. That
grouped list is the authoritative vocabulary, transcribed verbatim into
`00_Build/tdl-attributes.mjs`, which drives both `lint-attributes.mjs` (the oracle)
and `route-line-to-field.mjs` (the migration). Keep the two in step when the
reference changes.

**Line** — four groups, and nothing outside them:

| Group | Attributes |
|-------|------------|
| RepeatedTotal | `Border` `Combine` `Explode` `Field` `Key` `Local` `Use` `Indent` `Repeat` `Page Break` `Next Page` `On` `Stripe` |
| LineFormat | `DMPMode` `Fixed` `Height` `Line` `Remove` `Right Field` `Select` `Space Bottom` `Space Top` `Empty` `Skip Rows` `Full Object` `Option` `Switch` |
| Output | `JSON Tag as Desc Name` `JSON Tag` `Pre Printed` `Pre Printed Border` `XMLAttr` |
| Input | `Access Name` `Add` `Replace` `Delete` `Invisible` `Local Formula` `No Cursor` `Set` |

**Line has no `Text`, `Style`, `Font`, `Align`, `Width`, `Color`, `Title` or
`Paper`.** That is the finding that drove the whole Line-layer correction below.

**Field** — eight groups. The two that matter:

| Group | Attributes |
|-------|------------|
| FormatReport | `Align` `Background` `Border` `Border 3D` `Color` `FG Highlight` `Format` `Full Width` `Indent` `Line` `Print BG` `Print FG` `Print Style` `Space Left` `Space Right` `Style` `Type` `Width` |
| SpecialInputField | `ASCII Only` `Cancel` `Control` `Info` `KBLanguage` `Local` `Local Formula` `Max` `Notify` `Tooltip` `Valid` `Read Only` |
| RepeatedTableStorage | `Common Table` `Default Table Item` `Is ODBC Table` `Skip` `Storage` `Sub Title` `Table` `Table Search` `Unique` `Use` `Wide Space` `Trigger` `Dynamic` `Skip Action` `Skip SysNames` `On` `Key` |
| TabularDisplay | `Add` `Replace` `Delete` `Alter` `Cell` `Display` `DMPMode` `JSON Tag` `Pre Printed` `Pre Printed Border` `Quick Search` `Skip Cell` `Variable` `XMLAttr` `Fixed` `Scroll` `Scale` |
| CyclicTable | `Act on Table Element` `Cyclic Behavior` **`Set As`** `Set Always` |
| AutoColumn | `Bound` `Field` `Invisible` |
| GraphReport | `Graph Label` `Graph Value` `Graph X Axis Legend Title` `Modifies` `Option` `Set By Condition` `Switch` |
| SubForm | `Subform` `Case` |

**There is no `Text:` on Field either.** Literal text is `Set As : "..."`; the
Field page's own example is `[Field: TSPL Terms] Use : Name Field / Set as :
"Terms & Conditions"`. So `Text:` was invented at every level of JadePro, and its
838 occurrences are now `Set As` on a Field.

**Style** — exactly four: `Font`, `Height`, `Bold`, `Italic`. "The definition Style
can be used in the Field definition only." `Colour`, `Border`, `Background Colour`,
`Border Colour` and `Align` on a Style are invented; each has a Field counterpart
(`Color`, `Border`, `Background`, `Align`).

**Function** — `Action`, `Fetch Object`, `List Variable`, `Local Formula`, `Object`,
`Parameter`, `Return`, `Static Variable`, `Variable`. A body is **numbered
procedural statements**, not an attribute list:

```
100 : Action : Print Report
200 : Msg Box : "Alert" : ##x
```

`Var:`, `Param:` and `Returns:` are therefore all invented, and a bare `Add:` /
`Create:` / `Alter:` / `Accept:` attribute is not how an action is issued.

**Part** — `Line`/`Lines`, `Repeat`, `Scroll`, `Float`, `Vertical`, `Border`,
`Common Border`, `Bottom Line`, `Bottom Part`, `Break`, `Break On`, `Height`,
`Width`, `Space Top`, `Stripe`, `Background`, `Image`, `Object`, `ObjectEx`,
`Button`, `Total`/`Combine`, `Page Break`, `Set`, `Local`, `Use`, `Add`, `Replace`,
`Delete`, `On`, `Access Name`, `Excel Sheet Name`, `JSON Tag`, `Graph Type`,
`DMPMode`, `Fixed`.

**Line aliases** — `Fields`, `Left Field`, `Left Fields`, `Right Fields`, `Totals`,
`Total`, `Empty If`, `Empty On`.

> "Note that a line can have either fields or line, and not both."

**Report** — `Family` `Copies` `Export Empty Fields` `Export Header`
`fetch Collection` `Form` `Keep XML Case` **`Print`** `Output Pre Config Report`
`Plain JSON` `Plain XML` `Pre Load Control` `Print Set` `Set` `Stripe` `Title`
`Ledger Report` `Fetch Object` `Object` `Ledger Object Details` `Multi Object`
`Multi Objects` `Auto` `Subform` `Column Report` `Columnar`.

**Print is an attribute of Report, not a definition type.** That settles the
`[Print: ]` question: the 35 print layouts become `[Report: ]` definitions carrying
a `Print :` attribute over their `[Form: ]`, which is what probe `p28` tests.

### Attribute types

`Single` (one value, last wins), `Single List` (repeatable — `Part`, `Field`,
`Line`), `Dual`, `Dual List` (`Set : Var : Value`, `Repeat : Line : Collection`),
`Triple` (`Object : Ledger Entries : First : …`), `Triple List` (`Aggr Compute : … : Sum : …`),
Menu Item List (`Item`, `Key Item`, `Indent`), Event List (`On`).

Discreteness: repeated values are not allowed at the **first** sub-attribute level of
a list attribute.

---

## 4. Modifiers

Definition modifiers: `#` (modify existing — `[#Menu: Gateway of Tally]`), `!`
(optional/conditional — `[!Report: Rep1]` with `Option:`), `*` (re-initialise).

Attribute modifiers: **static** `Use`, `Add`, `Delete`, `Replace`;
**dynamic** `Option`, `Switch`, `Local`.

`Use : Name Field` is the standard way to reuse a stock field (name, amount, date,
quantity) — JadePro should use it instead of hand-rolling field behaviour.

---

## 5. Master customisation — there is no `Alter`

This is the largest correction in the whole project. TallyPrime does **not**
document `Alter:` as a way to add fields to a master. The documented mechanism is a
Report bound to the master object, with fields that `Storage:` into a UDF.

> "The attribute Storage of field definition is used to specify the UDF/storage
> component and attach it at the data object level to which the field is associated."

Documented example, verbatim:

```tdl
[Report : CompanyVehicles]
    Object : Company
.
[Field : CVeh]
    Use      : Name Field
    Storage  : Vehicle
    Unique   : Yes
[System : UDF]
    Vehicle : String : 700
```

So the shape is:

```tdl
[Report : MyItemScreen]
    Object : Item          ; binds the screen to the master object
    Form   : MyItemForm

[Form : MyItemForm]
    Part : MyItemPart
```

All eight JadePro `Alter:` blocks (Company, Item, Item+field-group, Sales Voucher,
Sales Voucher Item Details, Purchase Voucher, Purchase Voucher Item Details, Ledger)
are ERP-9-era syntax and must be **redesigned**, not patched.

### UDF rules

- `[System: UDF]` → `Name : DataType : IndexNumber`, with **no name in the bracket**.
- Index must be 1–65536. *"Numbers falling between 1 to 9999 and 20001 to 65536 are
  opened for customisation, and those between 10000 to 20000 are allotted for common
  development in TSPL."* → JadePro's 20001–20219 allocation is **valid**.
- Up to 65536 UDFs **per data type**, not in total.
- Types: String, Number, Amount, Quantity, Rate, Logical, Date, **Aggregate**.
  (`Text` is not a type — that was an earlier JadePro defect.)
- Read back with a **single `$`** in the context of the object: `$MyUDF`.
- `Aggregate` UDFs nest sub-components, sharing an index across different types.
- Multiple values: repeat a Line over the UDF name via `Repeat : Line : UDFName`.

---

## 6. Remote/XML output — the real replacement for `[Export:]`

There is no `Export` definition type. Output is produced by a **Report** that is
exported, plus `Collection` data sources:

- Report: `Plain XML`/`Plain JSON`, `XMLTag`, `JSON Tag`, `Export Empty Fields`,
  `Export Header`, `Keep XML Case`.
- Collection: `Remote URL`, `XMLTag`, `Remote Request`, `Object`, `Import Object`.

This matters concretely: **Tally's XML gateway is live on 127.0.0.1:9000** and was
verified this session to export a stock report over `ExportData`. A TDL Report marked
for plain-XML export is therefore a *reachable* data source for the Zebra ZPL
emitter — no `[Export:]` definition is needed or wanted. See
`TALLY-XML-FINDINGS.md`.

---

## 7. Security — use `Family:`, not bespoke rights

> "The family name specified in the report definitions using the Family attribute…
> appears in the Reports list while configuring user security. Administrators can then
> grant or deny access to the entire family."

JadePro hand-rolled a rights mechanism (`JpRtBarcode`, `JADE_BARCODE`, a
`13_Security.tdl` module). `Family:` on each Report is the built-in equivalent and
should replace it.

---

## 8. Printing — settled, and `[Print:]` is not merely renamed

Printing is **not** a definition type and not a Report attribute called `Print`
pointing at a layout. It is an **action** that puts the final Report into print mode.

> "Menu Action – Print/Print Collection. Menu Action Print or Print Collection enters
> the final Report in Print mode."

```tdl
[#Menu : Printing Menu]
    Add : Key Item : My Day Book : D : Print : Day Book
```

Or from a Button:

```tdl
[Button : Print Selected Pay slips]
    Key    : Alt + F11
    Action : Print Report : Multi Pay Slip Print
    Scope  : Selected Lines
```

`Print Report` accepts an optional Report-name parameter, and passes the user's
selection to the destination report through the built-in **Parameter Collection**
(`[Report: X] Collection : Parameter Collection`).

A Report simply lists the Forms it owns; orientation is a *variable*, not a
definition:

```tdl
[Report: Mixed Orientation]
    Form     : Frm1, Frm2
    Variable : SVPrintOrientation : String
[Form: Frm1]
    Set Always : SVPrintOrientation : "Portrait"
[Form: Frm2]
    Use          : Frm1
    Set Always : SVPrintOrientation : "Landscape"
```

**Open:** neither `Paper:` nor `Margin-*` is documented anywhere in the reference.
JadePro uses them in all 35 print layouts (`Paper: 232 x 140`, `Margin-right: 10`, …).
Paper size and margins look like **Tally print-configuration** concerns, not TDL
attributes. Until that is settled by a probe, the migration must not simply delete
them, and must not invent a replacement.

## 9. Reusable stock fields and Buttons

Field behaviour comes overwhelmingly from `Use : <stock field>`, not from
hand-written attributes. The stock names seen in the reference: `Name Field`,
`Short Name Field`, `Amount Field`, `Qty Primary Field`, `Uni Date Field`,
`Short Date Field`.

Other attributes that recur and that JadePro should adopt rather than reinvent:
`Table :` (pick-from popup), `Show Table :`, `Modifies :` (write to a variable),
`Set always :`, `Skip :`, `Display :`, `Variable :`, `Storage :`, `Width :` (which
**accepts units** — `120 mms`), `Border :`, `Align :`, `Full width :`.

Buttons are `[Button:]` definitions carrying `Key:`, `Action:`, `Title:`, `Scope:`,
and are attached to a Form via `Bottom Button :`. This is what JadePro's `[Keys:]`
blocks (Ctrl+S etc.) should become.

Named formulae are `[System: Formula]` entries, e.g.
`Smp IsSalesVT : $$IsSales:$VoucherTypeName` — an alternative to JadePro's many
`Jp*()` zero-argument functions.

## 10. CORRECTION: the Line-layer migration was only half right

`00_Build/fix-part-line-layer.mjs` inserted the missing `[Line:]` layer, which fixed the
`T0014` containment error. But it only enforced the **outer** rule — that a Part must
not contain a Field. It did not route each attribute to the definition type that
actually accepts it. Result: 1,826 attributes are now at `[Line:]` top level that do
not belong there:

```
Text   838     -> belongs on a [Field:] as `Set As:`   (see caveat below)
Style  692     -> belongs on a [Field:] / [Part:]
Font   128     -> belongs on a [Field:]
Title   34     -> belongs on a [Report:] / [Form:]
Paper   34     -> undocumented (see §8); jadePro-only
Align   16     -> belongs on a [Field:]
```

**Caveat on `Text`:** it appears in none of the Part / Line / Report attribute lists
actually read for §3, and literal text in the reference's own examples is always a
`[Field:]` with `Set As: "..."`. Those pages were truncated on read, so this is
strong-but-not-conclusive: treat "`Text` is not a TDL attribute" as a strong
expectation to confirm with one probe, not as established fact.

The generator preserved the original author’s invented vocabulary while satisfying the
bracket checker, which is exactly the failure mode we are trying to eliminate.

**Consequence:** the bundle is *structurally* sounder than it was but *semantically*
unchanged, and no lint rule can be trusted to have caught this class — the attribute
belongs to a different definition type than the one it sits in, which requires knowing
TDL's per-definition attribute table (§3), not just the hierarchy.

Any migration must therefore route attributes by **definition type**, not by block
nesting. `fix-part-line-layer.mjs` should be treated as a structural scaffold only.

### 10.1 The ownership rule (learned from T0014 at line 1274)

Tally said, of

```
[Line: JpCompanySettingsLine1]
    Field: <Field-Id: JwlShopName, Label: "Shop / Showroom Name">
        Width: 400
```

> error T0014: Incorrect attribute 'Width' is used for the definition 'Line'.

`Width` is indented, yet Tally attributes it to the **Line**. So an inline
`<...>` definition is **single-line**: it does not open an indentation sub-level.
By contrast `Add: Field` followed by a deeper `Field-id:` *does* open one.

That single rule is why the Line-layer migration satisfied the bracket checker
while moving 1,826 attributes to a definition that rejects them. Any parser or
migrator for this bundle must implement it — `lint-attributes.mjs` and
`route-line-to-field.mjs` both do, and that is what makes them agree.

### 10.2 RESOLVED — the routing is done, and the oracle is the proof

Three artifacts now replace guesswork:

| File | Role |
|------|------|
| `tdl-attributes.mjs` | The §3 grouped lists as machine-readable data, each set tagged with its source (`grouped` / `example` / `spec`). |
| `lint-attributes.mjs` | **The oracle.** Parses every definition, resolves each attribute's owner using §10.1, and checks it against the owner's row. Replaces one-compiler-error-per-screenshot with one local pass over all 17,637 lines. |
| `route-line-to-field.mjs` | Table-driven migration. Emits a *named* `[Field:]` per Line and moves Width/Style/Align/Color/Format/Dynamic/Skip onto it, `Text:` → `Set As`, `Field-Id:` → `Storage`, `Font: BOLD` → a shared `[Style:] Bold : Yes`, `Line Height:` → `Height`. Idempotent. |

Measured on the bundle: the `[Line:]` bucket fell from **1,903 to 90**. Overall
misrouted attributes went **2,603 → 1,111**.

The overall figure dropped by less than the Line figure because adding table rows
for the `Collection: Data/Report/Source` sub-kinds **revealed 237 attributes that
had been invisible** — the oracle had no row for those types and skipped them.
`Collection: Report` alone carries 30 invented `Print:`, 30 invented `Export:`, 30
`Source:`, 29 `Key:`, 26 `Var:` and 26 `Filters:`. This is worth stating plainly:
adding coverage to an oracle does not only find bugs, it can make the bug count go
*up*.

The original `Text` caveat is now closed. `Text` appears in none of Line's four
groups nor in any of Field's eight, and the Field page's own literal-text example
uses `Set As`. It is not a TDL attribute on any definition type.

What remains, with the probe that settles each:

| Remaining | Count | Probe |
|-----------|-------|-------|
| Function grammar (`Var`/`Param`/`Returns`/`Add`/`Create`/`Alter`/`Accept`) | 647 | `p26`, `p27` |
| `Collection: Report` invented attributes (`Print`/`Export`/`Source`/`Key`/`Var`/`Filters`) | 171 | `p29`, `p26` |
| `Field: Label` | 84 | `p23` |
| `Line: Part Name` / `New-page` | 23 | `p28`, `p33`; `Part Name` needs a structural fix, not a textual one |
| `Collection: Data` (`Set`/`Fetch`/`Include`/`Not On`) | 55 | `p29` |
| `Style: Colour` / `Border` / `Background Colour` / `Align` | 52 | `p25` |
| `Collection: Source: Data` | 11 | `p29` |
| `Menu: Title` | 1 | `p30` |
| Non-existent definition types (`Export` 30, `Screen` 15) | 45 | `p29`, `p30` |

Two of the four T0006 classes are now closed against the reference rather than a
probe:

- **`[Keys:]` (3) — deleted.** `Key` is a *Menu* attribute, not a definition type.
  TallyHelp's Menu page: for `Item`, *"the system automatically assigns the next
  available hotkey"*; `Key Item : <Name>:<Hot Key>:<Action>:<Param>` is the way to
  pin one. The menu already routed to both screens via `Display:`.
- **`[Print:]` (35) — rewritten as `[Form:]`.** `Print` is a Report attribute and a
  print layout is a Form, so `[Print: X]` became `[Form: X]` (plus a generated
  `[Part: XLines]` where the block listed Lines). The Form deliberately keeps the
  original name, so every existing `Print : X` reference still resolves.

Per decision: the **587 bare `Width:` column widths** were dropped rather than
mapped positionally onto Fields, and `Paper:` / `Margin-*` (34 layouts) were
dropped as undocumented. Print sizing therefore falls back to Tally defaults and
printed reports are plainer. Each drop leaves a comment.

One `If:` guard was **not** dropped. The invoice used `If: ##JwlOldGoldRef <> ""`
to suppress its old-gold block; dropping it would have printed an empty section
on every invoice. It is now the Line group's documented `Empty` attribute on all
8 old-gold lines: `Empty : ##JwlOldGoldRef = ""`.

`lint.mjs`'s keyword vocabulary is now **derived** from the same table. That
matters: it previously hard-coded `Field-id`, `Part Name`, `Var`, `Returns`,
`Text`, `Paper` and `Margin-*` as *legal*, which is exactly why it linted clean
on a bundle full of invented attributes. A linter cannot catch an error class
whose assumption it shares with the thing being checked. It now reports **420**
unrecognised keywords instead of silence, concentrated in `Returns` (133),
`Param` (65), `Var` (60), `Export` (49), `Text` (28), `Create` (25), `Paper`
(10) and `Margin-right` / `Margin-bottom` (10 each). It also now skips the body of
a `[System: UDF]` block, whose `Name : DataType : Index` lines are declarations
rather than keywords. The report is capped at 400 lines by default; set
`LINT_WARN_CAP` to see all of them.

## 11. Remaining open questions

1. **Barcode.** No `Barcode` definition type is documented. Code 128 on Tally-native
   output appears to require a Code 128 **font** (PATH A, already the default). The
   `[Barcode:]` approach (PATH B) has no documented basis and should be dropped
   rather than debugged.
2. **Paper/margins** — decided: dropped. Undocumented in the reference, so print
   sizing falls back to Tally defaults. The 587 positional column widths in the
   print layouts were dropped for the same reason.
3. **Attribute routing** — see §10.2. The table, the oracle, the Line→Field
   migration and the `[Keys:]` / `[Print:]` rewrites are done. 1,111 attributes
   and 45 definition types (`Export` 30, `Screen` 15) remain. The next error is
   `[Screen: JpItemCreateScreen]`; the two Screen/Export classes need the p29/p30
   shapes before 45 blocks are rewritten.
4. **Voucher customisation.** The TDL 9 chapter shows default definitions being
   extended with definition modifiers — `[#Part : VCH Narration]` +
   `Add : Option : …`, `[#Field : PPR Narr]`, `[#Part : X] Add : Lines : After : A : B`
   — never with `Alter:`. This is the mechanism the voucher work should use, and it
   is the one place where JadePro's instinct (extend a default) was right even though
   its syntax was wrong.