# Save a report as PDF

On the local Mac app, open a shared Markdown report and choose **Save PDF**.
The button becomes available after the report has loaded. Choose its destination
in the Save dialog; cancelling stays quiet. Download still saves the original.

PDF exports contain only the opened report, using a separate Chromium print
surface. Headings, lists, tables, code and HTTP(S) citations are preserved, with
source URLs printed beside links. Images remain alt text; raw HTML, local/app
links, rich math and Mermaid diagrams receive the same inert treatment as the
reader. Reports are not automatically redacted. Check their contents before
sharing them.

The reader's 1 MiB UTF-8 limit still applies. Export additionally bounds the
snapshot, node depth/count, output and generation time. A failure offers a new
attempt or the original download. PDF export is currently available only in a
local Mac desktop window; web and paired remote windows retain Download.

The selected file and its canonical parent directory are checked again before
temporary creation and commit. Changed or symlink destinations are refused;
these checks are filesystem race guards, not an OS sandbox. If a parent moves
during an export, an unprovable temporary entry is retained with private
permissions rather than deleting through a replacement path. An open Save
dialog remains under the user's control after closing the reader; finish or
cancel it before starting another PDF export.

This first version requires private file permissions and, for new files, an
exclusive hard-link commit. Destinations lacking those filesystem semantics
are unsupported. A save failure offers a local Mac folder or the original
download; the error does not identify a particular filesystem format.

## Portable checks

`pnpm test:core` includes the complete report PDF component and module tests.
They exercise successful loading, message replacement, cancellation, stale
results, retries, strict primary-window/main-frame authority, inert content,
citation protocols, singleflight jobs, load/print deadlines, private replacement
and destination races/symlink refusal. These checks do not run native dialogs.

## Disposable Mac acceptance

Use Node 24+, the repository's installed Electron and already-installed
`pdfjs-dist` and `@napi-rs/canvas` modules. The parser/canvas are verification
tools; they are not app dependencies. Give their absolute entry paths explicitly:

```sh
OMB_VERIFY_PDFJS_MODULE=/absolute/path/to/pdfjs-dist/legacy/build/pdf.mjs \
OMB_VERIFY_PDF_CANVAS_MODULE=/absolute/path/to/@napi-rs/canvas/index.js \
node --experimental-strip-types scripts/verify-report-pdf.mjs
```

The recipe serves the real report button/reader, loads the production preload
and PDF service in a hidden Electron app, and selects only a disposable output
through a Save-dialog stand-in. It checks quiet cancellation, a narrow reader,
actual Chromium pagination, all 120 synthetic sections, Unicode/code continuity,
safe PDF link annotations and absence of an unrelated-chat sentinel. It renders
every PDF page to PNG for visual inspection, records denied resource requests,
and verifies owned Electron PIDs and profile paths are gone before deleting its
temporary home. Unconfirmed cleanup retains that home and fails the recipe.

Private PDF bytes, screenshots, logs and receipts remain under ignored
`.local/report-pdf-*`. Inspect the rendered pages before claiming visual
acceptance. The source component, preload and Chromium export are real; its
message-file transport and destination choice are synthetic. This recipe does
not prove packaged startup, the native picker, live research quality or a signed
release, and it never opens the user's app or data.
