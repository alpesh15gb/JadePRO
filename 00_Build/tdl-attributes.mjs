#!/usr/bin/env node
// tdl-attributes.mjs
//
// THE ATTRIBUTE TABLE. Machine-readable, so that migration is driven by the spec
// instead of by one compiler error per screenshot.
//
// SOURCES
//   Every set below is transcribed from the grouped attribute list that TallyHelp
//   publishes at the top of each definition page. Those lists are grouped by
//   category (Line is grouped RepeatedTotal / LineFormat / Output / Input), which
//   is the closest thing the reference has to an exhaustive per-type vocabulary.
//
//   A grouped list is curated, so absence is strong evidence but not proof. Every
//   set therefore carries a `source` marker:
//     'grouped' - transcribed from the page's grouped list
//     'example' - seen working in that page's worked examples
//     'spec'    - from TDL-SPEC.md section 3
//
//   Line has NO Text, Style, Font, Align, Width, Color, Title or Paper in any group.
//   Field has no Text either; literal text is `Set As: "..."` (CyclicTable group).
//   `Text:` is therefore an invented attribute on every level - see ROUTES.

const def = (type, source, ...names) => [type, { source, names: names.map((n) => n.toLowerCase()) }];

export const ATTRS = new Map([
  // ------------------------------------------------------------------ Line
  def('Line', 'grouped',
    // RepeatedTotal
    'Border', 'Combine', 'Explode', 'Field', 'Key', 'Local', 'Use', 'Indent',
    'Repeat', 'Page Break', 'Next Page', 'On', 'Stripe',
    // LineFormat
    'DMPMode', 'Fixed', 'Height', 'Line', 'Remove', 'Right Field', 'Select',
    'Space Bottom', 'Space Top', 'Empty', 'Skip Rows', 'Full Object', 'Option',
    'Switch',
    // Output
    'JSON Tag as Desc Name', 'JSON Tag', 'Pre Printed', 'Pre Printed Border',
    'XMLAttr',
    // Input
    'Access Name', 'Add', 'Replace', 'Delete', 'Invisible', 'Local Formula',
    'No Cursor', 'Set',
    // aliases documented alongside the canonical names
    'Fields', 'Left Field', 'Left Fields', 'Right Fields', 'Totals', 'Total',
    'Empty If', 'Empty On'),

  // ----------------------------------------------------------------- Field
  def('Field', 'grouped',
    // FormatReport
    'Align', 'Background', 'Border', 'Border 3D', 'Color', 'FG Highlight',
    'Format', 'Full Width', 'Indent', 'Line', 'Print BG', 'Print FG',
    'Print Style', 'Space Left', 'Space Right', 'Style', 'Type', 'Width',
    // SpecialInputField
    'ASCII Only', 'Cancel', 'Control', 'Info', 'KBLanguage', 'Local',
    'Local Formula', 'Max', 'Notify', 'Tooltip', 'Valid', 'Read Only',
    // RepeatedTableStorage
    'Common Table', 'Default Table Item', 'Is ODBC Table', 'Skip', 'Storage',
    'Sub Title', 'Table', 'Table Search', 'Unique', 'Use', 'Wide Space',
    'Trigger', 'Dynamic', 'Skip Action', 'Skip SysNames', 'On', 'Key',
    // TabularDisplay
    'Add', 'Replace', 'Delete', 'Alter', 'Cell', 'Display', 'DMPMode',
    'JSON Tag', 'Pre Printed', 'Pre Printed Border', 'Quick Search',
    'Skip Cell', 'Variable', 'XMLAttr', 'Fixed', 'Scroll', 'Scale',
    // CyclicTable
    'Act on Table Element', 'Cyclic Behavior', 'Set As', 'Set Always',
    // AutoColumn
    'Bound', 'Field', 'Invisible',
    // GraphReport
    'Graph Label', 'Graph Value', 'Graph X Axis Legend Title', 'Modifies',
    'Option', 'Set By Condition', 'Switch',
    // SubForm / ExcelFormula / SkipForward
    'Subform', 'Case', 'Excel Formula', 'Skip Forward',
    // seen in the page's worked examples though absent from the grouped list
    'Not', 'Title'),

  // ------------------------------------------------------------------ Part
  def('Part', 'spec',
    'Line', 'Lines', 'Repeat', 'Scroll', 'Float', 'Vertical', 'Border',
    'Common Border', 'Bottom Line', 'Bottom Part', 'Break', 'Break On',
    'Height', 'Width', 'Space Top', 'Stripe', 'Background', 'Image', 'Object',
    'ObjectEx', 'Button', 'Total', 'Combine', 'Page Break', 'Set', 'Local',
    'Use', 'Add', 'Replace', 'Delete', 'On', 'Access Name',
    'Excel Sheet Name', 'JSON Tag', 'Graph Type', 'DMPMode', 'Fixed',
    'Display X Axis Legend', 'Excel Auto Fit', 'Enable Graph Cursor',
    'Graph Display Num Rows', 'Parts', 'Field'),

  // ------------------------------------------------------------------ Form
  def('Form', 'example',
    'Parts', 'Part', 'Bottom Part', 'Bottom Button', 'Background', 'Height',
    'Width', 'Full Object', 'Belongs To', 'Balancing', 'Balancing',
    'Closing Balance', 'Border', 'Style', 'DMPMode', 'Set', 'Repeat',
    'Scroll', 'Page Break', 'Stripe', 'Space Top', 'Title'),

  // ---------------------------------------------------------------- Report
  def('Report', 'grouped',
    'Family', 'Copies', 'Export Empty Fields', 'Export Header',
    'fetch Collection', 'Form', 'Keep XML Case', 'Print',
    'Output Pre Config Report', 'Plain JSON', 'Plain XML', 'Pre Load Control',
    'Print Set', 'Set', 'Stripe', 'Title', 'Ledger Report', 'Fetch Object',
    'Object', 'Ledger Object Details', 'Multi Object', 'Multi Objects', 'Auto',
    'Subform', 'Column Report', 'Columnar',
    // present in the page's examples though absent from the grouped list
    'Repeat', 'Variable'),

  // ------------------------------------------------- the other JadePro types
  def('Variable', 'example', 'Type', 'Data Type', 'Display', 'Value', 'Min',
    'Max', 'Local', 'Group', 'Input Mode', 'Table'),
  // Function bodies are NUMBERED procedural statements, not attribute lists:
  //   100 : Action : Print Report
  //   200 : Msg Box : "Alert" : ##x
  //   If / End If / Walk Collection / End Walk / Set / Log / Display
  def('Function', 'grouped',
    'Action', 'Fetch Object', 'List Variable', 'Local Formula', 'Object',
    'Parameter', 'Return', 'Static Variable', 'Variable',
    // procedural statements, all introduced by a 3-digit step number
    'If', 'End If', 'Walk Collection', 'End Walk', 'Exit', 'Else', 'Msg Box',
    'Set', 'Log', 'Display', 'Modify', 'Go', 'Leave', 'Print', 'Exit Action'),
  // Style has exactly four attributes. "The definition Style can be used in the
  // Field definition only." Colour/Border/Background on a Style are invented.
  def('Style', 'grouped', 'Font', 'Height', 'Bold', 'Italic'),
  def('Color', 'example', 'Font Color', 'Background Color', 'RGB', 'True Color'),
  def('Collection', 'spec', 'Title', 'Type', 'Format', 'Align', 'Child Of',
    'Fetch', 'Variable', 'Report', 'Source', 'Data', 'Parent', 'Fixed',
    'Local', 'Repeat', 'Display', 'Excel Sheet Name', 'Number', 'Total',
    'XMLTag', 'JSONTag', 'Not On', 'Include', 'Delete Empty', 'Mapping',
    'Block', 'Truncate'),
  // [Collection: Data/Report/Source: X] - the interface type is still Collection.
  def('Collection: Data', 'spec', 'Title', 'Type', 'Format', 'Align', 'Repeat',
    'Variable', 'Fixed', 'Local', 'Display', 'XMLTag', 'JSONTag', 'Parent'),
  def('Collection: Report', 'spec', 'Title', 'Type', 'Format', 'Align',
    'Repeat', 'Variable', 'Fixed', 'Local', 'Display', 'XMLTag', 'JSONTag',
    'Parent', 'Ledger Report', 'Columnar'),
  def('Collection: Source', 'spec', 'Title', 'Type', 'Format', 'Align',
    'Repeat', 'Variable', 'Fixed', 'Local', 'Fetch', 'Parent'),
  def('System', 'example', 'Variable', 'Formula', 'UDF', 'Scale', 'DocName'),
  def('Menu', 'example', 'Item', 'Key Item', 'Indent', 'Add', 'Delete', 'On'),
  def('Object', 'spec', 'Add', 'Delete', 'Replace', 'Modify', 'Action', 'Field',
    'Field Group', 'Modify Group', 'Key', 'On', 'Set', 'Use', 'Value'),
  def('Collection Source', 'example', 'Fetch', 'Type', 'Variable'),
  def('Name Set', 'example', 'Name Set', 'Item'),
  def('Rule Set', 'example', 'Rule', 'When', 'Then', 'Else'),
  def('Border', 'example', 'Top', 'Bottom', 'Left', 'Right', 'Style', 'Color'),
  def('Button', 'example', 'Key', 'Title', 'Action', 'Scope', 'Hint'),
  def('Notification', 'example', 'Message', 'Title', 'Type'),
  def('Resource', 'example', 'File Name', 'Source', 'Type'),
]);

// ---------------------------------------------------------------- ROUTES
// Where an attribute must move when it is found on the wrong definition type.
// `via` is the attribute of the parent definition that carries the nested item
// when one is needed; `as` is the replacement attribute name.
export const ROUTES = [
  // Line -> Field. These are the 1,826 attributes named in TDL-SPEC.md section 10.
  { attr: 'Style',        from: 'Line', to: 'Field', as: 'Style' },
  { attr: 'Align',        from: 'Line', to: 'Field', as: 'Align' },
  { attr: 'Width',        from: 'Line', to: 'Field', as: 'Width' },
  { attr: 'Color',        from: 'Line', to: 'Field', as: 'Color' },
  { attr: 'Format',       from: 'Line', to: 'Field', as: 'Format' },
  { attr: 'Background',   from: 'Line', to: 'Field', as: 'Background' },
  { attr: 'Border',       from: 'Line', to: 'Field', as: 'Border' },
  { attr: 'Dynamic',      from: 'Line', to: 'Field', as: 'Dynamic' },
  { attr: 'Skip',         from: 'Line', to: 'Field', as: 'Skip' },
  { attr: 'Font',         from: 'Line', to: 'Style', as: 'Font' },
  { attr: 'Text',         from: 'Line', to: 'Field', as: 'Set As', literal: true },
  // Field / Line -> Report or Form, context dependent; recorded but not auto-applied.
  { attr: 'Title',        from: 'Line', to: 'Report|Form', as: 'Title', hold: true },
  { attr: 'Paper',        from: 'Line', to: null, as: null, hold: true, why: 'undocumented' },
  { attr: 'Margin Left',  from: 'Line', to: null, as: null, hold: true, why: 'undocumented' },
  { attr: 'Margin Right', from: 'Line', to: null, as: null, hold: true, why: 'undocumented' },
  { attr: 'Margin Top',   from: 'Line', to: null, as: null, hold: true, why: 'undocumented' },
  { attr: 'Margin Bottom',from: 'Line', to: null, as: null, hold: true, why: 'undocumented' },
];

// Attributes with no place in any TallyPrime definition. Invented by the
// original JadePro author; must be rewritten, not moved.
export const INVENTED = new Set([
  'text', 'font', 'modify', 'new-page', 'field-id', 'part-id', 'label-caption',
]);

export function allows(type, attr) {
  const e = ATTRS.get(type);
  if (!e) return null;               // unknown type -> no opinion
  return e.names.includes(attr.trim().toLowerCase());
}

export function source(type) {
  const e = ATTRS.get(type);
  return e ? e.source : null;
}

export function routeFor(type, attr) {
  const a = attr.trim().toLowerCase();
  return ROUTES.find((r) => r.from === type && r.attr.toLowerCase() === a) || null;
}