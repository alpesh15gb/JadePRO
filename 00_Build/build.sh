#!/usr/bin/env bash
# =============================================================================
#  JadePro build script
# -----------------------------------------------------------------------------
#  1. Lints every module.
#  2. Concatenates them into a single loadable file, JadePro.tdl.
#  3. Verifies the bundle still lints as one file.
#
#  Load order matters: 00_Core defines the function library every later module
#  calls, so it must be first; 15_Install opens a screen that references
#  masters created elsewhere, so it goes last.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/tdl"
OUT="$ROOT/JadePro.tdl"

ORDER=(
  00_Core.tdl
  01_Main.tdl
  02_ItemMaster.tdl
  03_GoldRate.tdl
  04_Sales.tdl
  05_Purchase.tdl
  06_OldGold.tdl
  07_Karigar.tdl
  08_Barcode.tdl
  08a_BarcodeTally.tdl
  08b_BarcodeZPL.tdl
  09_Orders.tdl
  10_Repairs.tdl
  11_Reports.tdl
  12_Dashboard.tdl
  13_Security.tdl
  14_PrintInvoice.tdl
  15_Install.tdl
)

echo "== 1/3  Linting modules =="
node "$ROOT/00_Build/lint.mjs"
LINT=$?
if [ $LINT -ne 0 ]; then
  echo
  echo "BUILD STOPPED: fix the errors above before bundling."
  exit 1
fi

echo
echo "--  Coverage against the 20-point specification --"
# Buffer to a file rather than piping into tail: in a pipeline $? is the exit
# status of the LAST command, so `coverage.mjs | tail -3` would report tail's
# status (always 0) and quietly pass even when coverage FAILS.
COV_LOG="$(mktemp)"
if ! node "$ROOT/00_Build/coverage.mjs" > "$COV_LOG" 2>&1; then
  cat "$COV_LOG"
  rm -f "$COV_LOG"
  echo
  echo "BUILD STOPPED: a requirement area is not covered (see the FAIL lines above)."
  exit 1
fi
tail -3 "$COV_LOG"
rm -f "$COV_LOG"

echo
echo "== 2/3  Building JadePro.tdl =="
{
  echo "; ============================================================================="
  echo ";  JadePro Jewellery ERP for Tally Prime"
  echo ";  --------------------------------------------------------------------------"
  echo ";  GENERATED FILE - do not edit by hand."
  echo ";  Generated from the modules in ./tdl by 00_Build/build.sh"
  echo ";  Version : 1.0.0     Tally Prime v3.0 (release 2400) or later"
  echo ";"
  echo ";  Modules, in load order:"
  for m in "${ORDER[@]}"; do
    echo ";    $m"
  done
  echo ";"
  echo ";  How to load : F11 (Tally Prime > Alter > Manage TDL Functions)"
  echo ";                > Create New Function > Load > pick JadePro.tdl > Done"
  echo ";"
  echo ";  If a screen fails to open, unload the module and load 00_Core.tdl FIRST."
  echo "; ============================================================================="
  echo
  for m in "${ORDER[@]}"; do
    echo "; -----------------------------------------------------------------------------"
    echo ";; >>>>>>>>>>>>>>>>>>>>>>> BEGIN $m <<<<<<<<<<<<<<<<<<<<<<"
    cat "$SRC/$m"
    echo
  done
} > "$OUT"

LINES=$(wc -l < "$OUT" | tr -d ' ')
echo "JadePro.tdl written: $LINES lines from ${#ORDER[@]} modules"

echo
echo "== 3/3  Verifying the bundle =="
node "$ROOT/00_Build/lint-bundle.mjs" "$OUT"
BUNDLE=$?
if [ $BUNDLE -ne 0 ]; then
  echo
  echo "BUNDLE CHECK FAILED."
  exit 1
fi
echo
echo "BUILD OK  ->  $OUT"