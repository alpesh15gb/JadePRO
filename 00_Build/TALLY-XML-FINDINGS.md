# Tally Prime XML Gateway (port 9000) — confirmed findings

Date: 2026-10-04. Tally Prime at `C:\Program Files\TallyPrime`, PID 16580.

## Environment (from `C:\Program Files\TallyPrime\tally.ini`)

```
User TDL=Yes
TDL=D:\Jewel Pro\JadePro.tdl     <-- Tally IS auto-loading our bundle
Data=C:\Users\Public\TallyPrime\data
ServerPort=9000
Enable ODBC Server=Yes
Ignore Tcp Timeout=Yes
Client Server=None
```

Two independent facts worth keeping:

1. **`tally.ini` already points at our bundle.** No manual F11 "Manage TDL" is needed to
   get the file read; restarting Tally is enough to re-parse `JadePro.tdl`.
2. **The Tally ODBC driver is installed** (`Tally ODBC Driver64`, DSN `TallyODBC64_9000`
   -> `(local):9000`). That is a second, completely separate read path into the running
   Tally process that does not depend on the XML envelope syntax at all.

## What the gateway actually does

Probing with `<ENVELOPE><HEADER><TALLYREQUEST>VERB</TALLYREQUEST></HEADER><BODY></BODY></ENVELOPE>`:

| Verb                     | Response                              |
|--------------------------|---------------------------------------|
| `GetDate`                | `<RESPONSE>Unknown Request, cannot be processed</RESPONSE>` |
| `GetVersion`             | same                                  |
| `GetCompanyInfo`         | same                                  |
| `GetCurrentUser`         | same                                  |
| `ExportData`             | **empty 200** (recognised, body empty) |

So the gateway is live and dispatching on `TALLYREQUEST`. `GetDate` / `GetVersion` /
`GetCompanyInfo` are **not** XML-gateway verbs in Prime — they are ODBC/driver-level or
TDL-level operations, so "Unknown Request" for them is the correct, expected answer and is
**not** evidence that the socket or the request envelope is malformed. An empty 200 for
`ExportData` is a genuinely recognised verb with a body Tally had nothing to do with.

Conclusion: the envelope shape is right. `<HEADER><TALLYREQUEST>ExportData</TALLYREQUEST></HEADER>`
is the correct form; the remaining unknown is the `<BODY>` payload, not the framing.

## The crash (my fault, and the lesson)

Sweeping *data-modifying* verbs with empty bodies — `ImportData`, `CreateData`, `AlterData`,
`DeleteData` — killed Tally:

```
Internal Error.  Contact Tally Solutions.
Software Exception c0000005
(Memory Access Violation)
```

Tally's main window retitled itself to `Error` and every subsequent request, including
re-sends of `ExportData` and of a deliberately bogus verb, returned an **empty 200**. An
empty response therefore does **not** mean "recognised" unless the process is known healthy —
a modal dialog also produces empty 200s. Check `MainWindowTitle` before drawing any
conclusion from a blank reply.

**Rule: only ever send `ExportData` (read-only) to this port.** Never `ImportData`,
`CreateData`, `AlterData` or `DeleteData`. This tool has no write capability and needs none.

## Next step

Build a real `<BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>...</REPORTNAME>` payload and
compare against the ODBC driver as a control. Worth noting: a TDL **compile** still cannot be
triggered over XML — the gateway has no "compile this file" verb, and the c0000005 above is a
reminder that the verb space is smaller than it looks. `ExportData` can however prove out
`[Export:]` behaviour at runtime once the TDL compiles, which is the one open Zebra-design
question.

---

## Addendum — `/TDL` command line, and the headless compile oracle

### Tally Prime accepts a TDL file on the command line

The VS Code extension **Tally TDL** (`saivineeth.tally-tdl`) documents this setting:

> `tallyCommandLineArgs`: Additional command line arguments to pass to Tally.
> **The /TDL and file path arguments are added automatically.** (default: `[]`)

So `tally.exe /TDL "D:\path\file.tdl"` loads a TDL. This supersedes the earlier
conclusion that no headless compile path exists (that conclusion was about
Tally Developer 9's `/FILE /PROJECT /new`, which only open the GUI).

### But it gives no verdict by itself

Tally raised **no dialog** when launched with `/TDL` on a deliberately invalid file.
TDL errors surface only in F11 TDL Management, never at startup. So a command-line
launch tells us nothing about whether the file compiled.

### The oracle

A TDL report only exists inside Tally if the file compiled and loaded. So the verdict
can be read back over the gateway:

1. restart Tally with `/TDL <file>`
2. `ExportData` for a report that `<file>` defines
3. found => compiled and loaded; missing => it did not

Harness: `00_Build/compile-check.sh <file> <report-title>`.

### Precondition discovered — a company must be loaded

The first run reported the sentinel missing, which was **a false negative**. The cause:

```
ExportData -> <LINEERROR>Could not find Company ''</LINEERROR>
```

ExportData needs an open company, and a `/TDL` launch does **not** auto-load one, even
though `tally.ini` says `Load=100000`. With no company, *every* report lookup fails —
including stock ones that succeed when a company *is* open ("Balance Sheet" returned
real data earlier in the session, and fails this way after a bare `/TDL` start).

So the oracle must assert the precondition before trusting a "not found":

    company loaded?  no  -> INCONCLUSIVE, open the company and retry
    company loaded?  yes -> "Could not find Report" is a REAL failure

This is the same class of mistake as the earlier crash: **an empty/negative response was
read as a signal when the process was in the wrong state.** Check the precondition
before drawing a conclusion.

### Status of the oracle

**Not yet validated.** No positive ("compiled") result has been observed, so it is not
yet proven that `ExportData` can resolve a TDL-defined report by `Title` at all. Two
possibilities remain open: `/TDL` may not load the file as expected, or `ExportData`
may only resolve stock reports. Next step is to open a company and re-run
`compile-check.sh` against the sentinel.

### Other gateways found (GitHub)

- **NienHQ/tally** — Go, single binary, REST/JSON over Tally's port 9000, Swagger UI,
  one-shot `-dump`, bearer auth, writes off by default. MIT. Useful for the data side
  and for safely scripting the gateway with correct envelopes.
- **Accounting-Companion/TallyConnector** — C# bridge over the Tally XML API.
- **aadil-sengupta/Tally.Py** — Python XML structures for TallyPrime.

None of these contain TDL source. They speak the data protocol, not the definition
language.
