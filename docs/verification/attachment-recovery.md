# Attachment upload failure and recovery

GrokOff bounds each image, document or audio upload attempt to 90 seconds,
including receiving and decoding the response body. The existing single retry
uses the same upload ID so a lost success response can recover without storing
a duplicate. Both stalled attempts settle within three minutes. A completed
permission or size refusal is not replayed, including one whose error body
stalls. The limit leaves headroom for supported 25 MiB documents over a remote
connection; it is longer than the small provider-inventory check.

Final failure names the file and explains how to retry. The composer keeps the
unsent draft, removes failed image previews, clears the completed operation's
pending count and permits sending again. Successful attachments from the same
selection are retained. A fresh pick, drop or image paste clears the previous
attachment warning when it starts; failures arriving during that attempt remain
visible after other uploads succeed. Removing an image chip does not cancel its transport
or clear another active upload's pending count.

## Maintained offline checks

`pnpm test:core` runs these complete files. For the focused group:

```sh
pnpm exec vitest run src/lib/composer-attachments.test.ts \
  src/lib/intake-files.test.ts src/lib/drafts.test.ts \
  server/attachments.test.ts src/lib/upload-recovery.test.ts \
  src/components/ComposerUpload.interaction.test.ts
```

| File | Behavior covered |
| --- | --- |
| `src/lib/composer-attachments.test.ts` | Supported formats, limits, safe prompt tags, preview handoff, stable ID after settled network/503 failure |
| `src/lib/intake-files.test.ts` | Selected/drop ordering, failed filenames, partial batch success, private-upload failure without arbitrary disk fallback |
| `src/lib/drafts.test.ts` | Keyed unsent text/attachments, persistence, pending counters, failed-send recovery across navigation |
| `server/attachments.test.ts` | Private file permissions, quota reservations, partial cleanup, safe filenames and idempotent writes in an owned temporary store |
| `src/lib/upload-recovery.test.ts` | Held request and response-body deadlines, aborted transport, late result rejection, same-ID retry, 401/403/413 without replay |
| `src/components/ComposerUpload.interaction.test.ts` | Real React Composer and draft state: final failure, re-selection, Send, retained text/successful files, pasted filename, removal while another upload remains active |

The recovery transport is synthetic and timers are advanced explicitly. The
Composer interaction uses the real controls and keyed draft helpers; its store
dispatch and unrelated voice/role controls are stubbed. It verifies submitted
payloads, not provider execution or server persistence of the sent turn.

These checks do not establish native file-picker/clipboard behavior, visual
layout, real remote throughput, a live account, OS file-access permissions, or
an upload after a packaged Mac restart. Existing message-file and report tests
continue to enforce message grants; this change does not widen file access.
