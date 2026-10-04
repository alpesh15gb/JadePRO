#!/usr/bin/env bash
# compile-check.sh <tdl-file> <sentinel-report-title>
#
# HEADLESS TDL COMPILE ORACLE
# ----------------------------
# Tally Prime accepts a TDL file on the command line:
#
#     tally.exe /TDL "D:\path\to\file.tdl"
#
# But it never raises a dialog for TDL errors at startup - errors are only shown
# in F11 TDL Management. So "did it compile?" cannot be read from the process.
#
# It CAN be read from the XML gateway. A TDL report only exists in Tally if the
# file compiled and loaded. So:
#
#     1. restart Tally with /TDL <file>
#     2. ask the gateway to export a report that the file defines
#     3. found  -> the file COMPILED AND LOADED
#        missing -> it did not (and the gateway tells us it cannot find it)
#
# This turns the fix-one-error-per-manual-reload loop into a script.
#
# Usage:
#     bash 00_Build/compile-check.sh <tdl-file> <report-title> [extra-tdl-file...]
#
set -u
TALLY_EXE='C:\Program Files\TallyPrime\tally.exe'
GW='http://127.0.0.1:9000/'
PS='C:\Program Files\TallyPrime\tally.exe'

if [ $# -lt 2 ]; then
  echo "usage: compile-check.sh <tdl-file> <sentinel-report-title> [extra...]" >&2
  exit 64
fi
SENTINEL="$2"
FILE1="$1"; shift 2
FILES=("$FILE1" "$@")

echo "== restarting Tally with /TDL =="
powershell -NoProfile -Command "
  Get-Process tally -ErrorAction SilentlyContinue | ForEach-Object { \$_.CloseMainWindow() | Out-Null }
  Start-Sleep -Seconds 4
  Get-Process tally -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
" >/dev/null 2>&1

# /TDL takes one file. Load the first; any extra files are the user's concern.
FIRST=$(cd "$(dirname "${FILES[0]}")" && cygpath -w "$PWD/$(basename "${FILES[0]}")" 2>/dev/null || cygpath -w "${FILES[0]}" 2>/dev/null || echo "${FILES[0]}")
echo "   loading: $FIRST"
powershell -NoProfile -Command "Start-Process '$TALLY_EXE' -ArgumentList '/TDL','$FIRST'" >/dev/null 2>&1

echo "== waiting for the gateway =="
for i in $(seq 1 40); do
  sleep 3
  if powershell -NoProfile -Command "if (Get-Process tally -ErrorAction SilentlyContinue) {exit 0} else {exit 1}" >/dev/null 2>&1; then
    if netstat -ano 2>/dev/null | grep -q ':9000.*LISTENING'; then
      echo "   up after $((i*3))s"
      break
    fi
  fi
done

echo "== precondition: is a company open in Tally? =="
# ExportData needs an open company. Without one EVERY lookup fails - including
# stock reports - so a "report not found" answer would be a false negative.
# Probe a stock report first; if even that fails, the oracle cannot be trusted.
probe() {
  curl -s -m 25 -X POST "$GW" -H "Content-Type: application/xml" \
    -d "<ENVELOPE><HEADER><TALLYREQUEST>ExportData</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>$1</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>"
}
CONTROL=$(probe "Balance Sheet")
if [ -z "$CONTROL" ]; then
  echo "RESULT: INCONCLUSIVE - gateway returned nothing (Tally busy / still starting)"
  exit 2
fi
if echo "$CONTROL" | grep -q "Could not find Company"; then
  echo "RESULT: INCONCLUSIVE - no company is open in Tally, so every lookup fails."
  echo "           Open a company (e.g. 100000) and re-run; a 'report not found'"
  echo "           answer would be a FALSE NEGATIVE until then."
  exit 2
fi
if echo "$CONTROL" | grep -q "Could not find Report"; then
  echo "RESULT: INCONCLUSIVE - stock control report missing; gateway/company state unknown"
  exit 2
fi
echo "   OK - gateway healthy, a company is open (control 'Balance Sheet' resolved)"

echo "== asking the gateway for the sentinel report =="
RESP=$(probe "$SENTINEL")

if [ -z "$RESP" ]; then
  echo "RESULT: INCONCLUSIVE - empty response for the sentinel (Tally busy?)"
  exit 2
fi
if echo "$RESP" | grep -q "Could not find Report"; then
  echo "RESULT: FAILED - '$SENTINEL' not found => the TDL did not compile/load"
  exit 1
fi
echo "RESULT: COMPILED - '$SENTINEL' was found"
echo "$RESP" | head -20
exit 0