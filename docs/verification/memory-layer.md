<!-- GrokOff modification (2026-10-09): document current-editor Delete/Tidy up completion and its verification boundaries. -->
<!-- GrokOff modification (2026-10-09): verify bounded Save/Undo reconciliation and fresh overlapping mutation metadata without altering memory mutation or journal APIs. -->
<!-- GrokOff modification (2026-10-09): document isolated current-editor read ownership and exact verification boundaries. -->
<!-- GrokOff modification (2026-10-09): first-edit and source restart acceptance. -->

# Memory: recall, upkeep and the tidy-up

Automatic recall, the topic index and until dates only read memory. Memory
upkeep (background capture into MEMORY.md and topic files, About me learned
from the person's words, and the nightly tidy-up) is on unless a bot's switch
is off, and every memory write is a journaled, undoable row. See [the memory guide](../memory.md).

## Explicit edits before the first chat and after restart

```sh
pnpm exec vitest run server/memory-first-edit.test.ts server/memory-continuity.e2e.test.ts
```

The first check opens an uninitialized bot's empty memory and saves using that
file's hash. Workspace initialization must not create a false conflict. A real
intervening edit still returns 409 without overwriting the newer text.

The HTTP check creates an isolated fake-engine workspace, makes an explicit
preference edit and a correction, creates an aliased topic, and stops its server
process. A different owned server PID reopens the same temporary data. It must
restore exact file bytes/hashes and the journal, supply the corrected preference
to the fake CLI's actual system prompt, and recall the topic in a new chat.
Undo restores the earlier preference; deleting the topic removes it from a
subsequent chat's recall. Readiness checks pin the replacement's PID before
mutations. Cleanup waits for owned processes to exit before removing their homes.

This verifies source-server persistence and prompt delivery. It does not launch
or restart the personal app, import another application's memory, or prove a
packaged memory editor or a real model's recall quality. The fixture disables
background upkeep and uses synthetic preferences; its writes are disposable.

## Exercise the real path

```sh
pnpm exec vitest run server/memory-layer.e2e.test.ts
pnpm exec vitest run server/spend-cap-api.test.ts
pnpm exec vitest run server/memory-entries.test.ts server/recall.test.ts server/memory-upkeep.test.ts server/workspace.test.ts
pnpm exec vitest run src/components/bot-settings/MemorySection.test.ts src/lib/memory.test.ts server/drivers/agents-catalog-wire.test.ts
```

The API fixture launches the shared isolated server with the fake engine. The
capture and tidy-up model calls are answered by `FAKE_CLAUDE_TEXT_ROUTES`, a
JSON file mapping a prompt marker (`CAPTURE_MARKER`, `TIDY_MARKER`) to a
reply, re-read on every call so a step can change it. `FAKE_CLAUDE_PROMPTS`
records every turn the engine received, which is where recall shows.

Evidence covers:

- A topic file is listed with its title and aliases, and found by an alias the text never uses.
- A fact said in one chat is recalled in a new chat, named by its source.
- An entry past its until date leaves the prompt; one without a date stays.
- A new bot has upkeep on; switched off, nothing is captured and **Tidy up now** is refused.
- A rejected settings update does not discard a queued capture or change the upkeep switch.
- Upkeep on: core facts are appended as dated, `(noticed)` entries with their until date; detail is filed into a topic file created with a title and aliases; all journaled as upkeep.
- `Balance is -10` captured twice is kept once; `Balance is 10` is a different fact.
- A fact about the person reaches About me on its own as a dated, attributed line in the prompt; Remove takes it out and a second Remove is refused.
- The tidy-up archives the expired entry and strikes the contradicted one, reports it, and Undo restores the file.
- A routine run is not captured as a person's conversation and never adds owner facts to About me.
- Background calls book their actual helper model, tokens and cost to the bot's usage. Capture, organization and contradiction checks each respect the configured monthly cap; free deterministic cleanup still runs at the cap.

Unit tests add the share limit on small notebooks (no contradiction change below
five entries), the nightly schedule (once a day after the hour, never while the
bot is busy, catching up after sleep), backup pauses, and engines without a
one-shot text call. They also cover expired topic facts disappearing from both
alias recall and the search index after midnight without a file edit, retrying
malformed organization output and deferred moves, Unicode topic names, and
stopping upkeep writes when its switch changes during a model call. Search
checks use actual index results for signed-number/symbol false matches and
historical files crowding out current topics. A failed topic write leaves its
notes in the notebook; retrying completes only the remaining moves.

## Not proven here

The fake engine answers the model steps with scripted JSON, so these tests
prove the plumbing, not the quality of what a real model captures or judges
contradictory. Check that by hand with a real Claude bot: switch upkeep on,
mention a preference in passing, wait two minutes, and read the Memory panel.

## Editor read ownership

```sh
pnpm exec vitest run src/components/bot-settings/MemorySection.interaction.test.ts src/components/bot-settings/MemorySection.test.ts src/lib/memory.test.ts
pnpm exec vitest run server/memory-store.test.ts server/memory-journal.test.ts server/memory-routes.test.ts
```

The interaction fixture mounts the actual MemorySection and child controls in
React with deferred in-memory memory responses. It seals fetch, Store dispatch
and desktop capabilities, then disposes the DOM between cases. It sends no
provider/model calls and does not use real accounts, bot folders or native UI.

A held read for topic A cannot replace topic B or its newer draft. Document reads lose ownership after selection or typing; all reads lose
ownership after deactivation or unmount. A completed mutation supersedes its
still-current editor reads; navigation begun after Save retains its own read. A
current metadata refresh can still finish while the preserved draft is typed
or a rejected Save reports a conflict. Current failures remain visible and a
current read can recover. New topic's template follow-through also requires
its own successful current read. Dirty drafts survive a section reactivation;
Save keeps its existing expected-hash payload, conflict Reload keeps the
unsaved draft without cancelling current metadata, and Undo retains its restored document. Discard and daily-log
read-only controls still work, including StrictMode lifetime cleanup.

The separate existing isolated server files exercise containment, conflict,
mutation/journal and HTTP behavior. The component fixture uses synthetic hash
values; it does not establish real filesystem persistence or capture quality,
and it does not test model-driven Tidy up. This unit changes read projection
ownership without changing server mutation, hash, journal or memory APIs.

## Save response ownership

The same complete interaction fixture holds Save responses while the person
continues typing or selects another file. A still-current submitted document
keeps newer text and its dirty intent, while its next Save uses the successful
receipt's hash, including a draft preserved while its section is hidden or
reopened. Unmount ends Save editor ownership. A later selected file, pending navigation, same-path reread or
completed Undo revision keeps its own text/hash. Same-file Undo also ends an
older Save receipt's ownership when its draft remains dirty; the existing
optimistic-hash conflict contract remains in use. Old Save conflicts/errors do
not appear on that later selection; a current conflict still supports Reload
and keeps the newer unsaved draft. Typing that cancels pending navigation keeps
ownership of its still-loaded document. Save metadata and delayed journal reads
cannot supersede newer activation metadata or its document hydration. Server mutation, expected-hash and journal APIs remain
unchanged. These are isolated source-DOM checks, not native acceptance or a
claim that every asynchronous editor mutation has been reconciled.

## Undo response ownership

The same interaction fixture holds either the Undo mutation or its subsequent
journal response. Typing while either request is pending stays dirty; a later
selection, same-path reread or successful Save keeps its own text and hash.
Navigation started after Undo keeps its pending read. A clean current document
receives the restored text/hash before the journal refresh, while a dirty
document retains its existing optimistic hash for the server's next conflict
check. A successful Undo still invalidates older Save ownership for its loaded
revision; a Save started after a later same-path reread retains its own receipt
and uses its successful hash on the next Save.
Undo metadata/journal responses cannot replace newer activation metadata, and
an error from an abandoned editor cannot appear on its later selection. A
current journal failure remains visible; an old journal failure cannot appear
after reactivation has loaded newer metadata beside a retained dirty draft. These
are actual source-component interactions with sealed in-memory transports;
they do not establish native behavior or filesystem commit order. Delete,
Tidy up and server mutation/journal contracts are outside this correction.

## Metadata after overlapping Save and Undo

The interaction fixture holds Save while Undo on another file completes, then
reverses the completion order. Each successful mutation in the same active view
starts fresh overview and journal reads. The resulting change rows and Undo
controls appear without reopening Settings; the older overview carried in a
mutation response cannot replace current server metadata. These reads leave
current document selection, dirty drafts and successful Save hashes unchanged.

Later metadata reads supersede earlier metadata results and errors. A later
activation owns its own hydration, so an old mutation cannot start reads over
that view. Current overview/journal failures remain visible. A subsequent successful
metadata refresh clears only an older metadata failure, including one that
arrived while the later mutation was pending; a newer file-read error remains
visible even if its text matches the old failure. These are actual component interactions
with deferred in-memory responses, not native app, filesystem commit ordering,
provider or concurrency load acceptance. The server mutation, expected-hash and
journal APIs remain unchanged.

## Delete and Tidy up while the editor changes

`MemorySection.tidy-delete.interaction.test.ts` holds a Delete or Tidy up
response while the person keeps working, then releases it. Both actions now
decide from the editor as it is when they finish, not as it was at the click.
Text typed while Tidy up runs stays in the editor, unsaved; a file opened in
the meantime stays open and is reread, so it shows the tidied text; a
selection that is still loading is reissued and wins over the older file. A
clean open document is still reread after Tidy up. Delete closes the editor
only when the deleted file is the one on screen: a different file opened since
the click stays open with its draft, and a read of the deleted file that was
still loading is cancelled. Confirming Delete still discards a draft that was
already unsaved at the click; text typed after the click stays, and a later
Save still uses the existing expected-hash check against the deleted file.

Both actions refresh overview and journal through the same current-metadata
path as Save and Undo, so a delayed Delete or Tidy up journal cannot replace
newer metadata. Twelve actual component interactions with deferred in-memory
responses cover this; eight of them fail on the previous component. They are
not native app, filesystem, provider or model-call acceptance, and the Tidy up
request and its server behavior are unchanged.

A Save that overlaps Delete of its file or Tidy up waits for those mutation
requests to settle, then reads the actual current file before reconciling its
receipt. Only matching path, hash, text and existence can mark the submitted
revision clean. Reopening Settings alone is not proof of freshness: the file
may have been loaded before housekeeping committed. A valid Save made after
housekeeping keeps its saved hash; a stale receipt leaves the draft dirty.
A failed verification read or another mutation during verification also leaves
the draft unsaved. Delete of a different file does not hold up this Save.
The API completion ends the barrier, so a fresh reread and Save while journal
metadata is still loading remain current. Failed mutation requests release the
barrier too; the file read determines whether the Save receipt is still valid.

A Delete or Tidy up response from a previous Settings activation leaves that
view's editor, pending selection, notice and error alone. Its disk effect still
participates in an overlapping Save's independent verification. Successful Tidy
starts the pending selection or clean document reread before awaiting metadata,
so a failed journal refresh cannot let a delayed pre-Tidy response replace the
fresh text or hash. That metadata error remains visible.

The 37 maintained held-response controls cover newer typing, pending selection,
metadata completion orders, reopening before or after housekeeping starts,
a newly activated view loading before the disk changes, both mutation/Save
response orders, and valid later Save receipts. Additional verification controls
cover read failure, navigation during the read and deleting a saved empty file
whose text and hash match the missing file but whose existence differs.
These remain source-DOM checks with sealed in-memory transports, separate from
native app, filesystem transaction, provider or model-driven Tidy acceptance.
