// @vitest-environment happy-dom
// GrokOff: Tidy and Delete in the memory editor leave newer typing, navigation and metadata alone.
// Same sealed synthetic seams as MemorySection.interaction.test.ts: deferred in-memory
// responses; no provider, server, filesystem, account, native UI or background model calls.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Bot } from "@/state/store";
import type { MemoryDoc, MemoryJournalRow, MemoryOverview, SaveResult, TidyReport, UpkeepStatus } from "@/lib/memory";
import { setLocale } from "@/lib/i18n";
import { MemorySection } from "./MemorySection";

type TidyResult = { report: TidyReport; overview: MemoryOverview };
const fixture = vi.hoisted(() => ({
  dispatch: vi.fn(),
  overview: vi.fn<(botId: string) => Promise<MemoryOverview>>(),
  journal: vi.fn<(botId: string) => Promise<MemoryJournalRow[]>>(),
  doc: vi.fn<(botId: string, path: string) => Promise<MemoryDoc>>(),
  save: vi.fn<(botId: string, path: string, text: string, hash: string | undefined) => Promise<SaveResult>>(),
  tidy: vi.fn<(botId: string) => Promise<{ report: TidyReport; overview: MemoryOverview }>>(),
  remove: vi.fn<(botId: string, path: string) => Promise<{ overview: MemoryOverview }>>(),
  upkeep: vi.fn<(botId: string) => Promise<UpkeepStatus>>(),
}));
vi.mock("@/state/store", async original => ({
  ...await original<typeof import("@/state/store")>(),
  useStore: () => ({ dispatch: fixture.dispatch }),
}));
vi.mock("../DesktopCapabilities", () => ({
  useDesktopCapabilities: () => ({ capabilities: { host: { platform: "other", homeDir: undefined } } }),
}));
vi.mock("@/lib/memory", async original => ({
  ...await original<typeof import("@/lib/memory")>(),
  fetchMemoryOverview: fixture.overview,
  fetchMemoryJournal: fixture.journal,
  fetchMemoryDoc: fixture.doc,
  saveMemoryDoc: fixture.save,
  tidyMemoryNow: fixture.tidy,
  deleteMemoryDoc: fixture.remove,
  fetchUpkeepStatus: fixture.upkeep,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const doc = (path = "MEMORY.md", text = `Saved ${path}`, hash = `hash:${path}`): MemoryDoc => ({ path, text, hash, exists: true });
// Upkeep is on, so the card shows "Tidy up now".
const bot: Bot = { id: "memory-fixture", threadId: "memory-thread", name: "Fixture", title: "", description: "", color: "green", unread: false, notifications: false, messages: [], memoryUpkeep: true, modelSelection: { instanceId: "synthetic", model: "unused" } };
const overview = (workspacePath = "/synthetic/current"): MemoryOverview => ({
  botId: bot.id, workspacePath,
  index: { lines: 1, bytes: 10, loadedLines: 1, loadedBytes: 10, maxLines: 200, maxBytes: 24_000, truncated: false, hash: "index-hash" },
  topics: ["a", "b"].map(name => ({ path: `memory/${name}.md`, name: `${name}.md`, bytes: 10, modifiedAt: 1 })),
  logs: [{ path: "memory/log/synthetic.md", name: "synthetic.md", bytes: 10, modifiedAt: 1 }],
});
const report: TidyReport = { at: 1, expired: 0, duplicates: 0, superseded: 0, deferred: 0, contradictionsChecked: false };
const tidied = (): TidyResult => ({ report, overview: overview() });
const row: MemoryJournalRow = { id: "change", at: 1, botId: bot.id, path: "memory/b.md", actor: "person", via: "ui", kind: "edited", beforeHash: "before", afterHash: "after", diff: "", added: 1, removed: 0, canRevert: true };
let root: Root;
let container: HTMLDivElement;
const tick = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const button = (label: string) => {
  const result = [...container.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent?.trim() === label || el.querySelector("span")?.textContent === label);
  expect(result, label).toBeDefined();
  return result!;
};
const editor = () => container.querySelector<HTMLTextAreaElement>("textarea");
const click = async (label: string) => { act(() => button(label).click()); await tick(); };
const clickDelete = async (name: string) => {
  const trash = container.querySelector<HTMLButtonElement>(`button[aria-label="Delete ${name}"]`);
  expect(trash, `Delete ${name}`).not.toBeNull();
  act(() => trash!.click());
  await tick();
};
const type = async (value: string) => {
  const input = editor()!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await tick();
};
const render = async (active = true) => { await act(async () => root.render(createElement(MemorySection, { bot, active, onToggle: fixture.dispatch }))); await tick(); };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected fixture transport"); }));
  vi.stubGlobal("confirm", vi.fn(() => true));
  setLocale("en");
  fixture.dispatch.mockReset();
  fixture.overview.mockReset().mockResolvedValue(overview());
  fixture.journal.mockReset().mockResolvedValue([]);
  fixture.doc.mockReset().mockImplementation(async (_id, path) => doc(path));
  fixture.save.mockReset().mockImplementation(async (_id, path, text) => ({ ok: true, doc: doc(path, text, "saved-hash"), overview: overview() }));
  fixture.tidy.mockReset().mockImplementation(async () => tidied());
  fixture.remove.mockReset().mockImplementation(async () => ({ overview: overview() }));
  fixture.upkeep.mockReset().mockResolvedValue({ enabled: true, modelSteps: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it("keeps text typed while Tidy up now is pending", async () => {
  await render();
  const held = deferred<TidyResult>();
  fixture.tidy.mockReturnValueOnce(held.promise);
  await click("Tidy up now");
  await type("Typed while tidy runs");
  await act(async () => held.resolve(tidied()));
  await tick();
  expect(editor()!.value).toBe("Typed while tidy runs");
  expect(button("Save").disabled).toBe(false);
  expect(container.textContent).toContain("Nothing to tidy.");
});

it("keeps a file opened while Tidy up now is pending, and shows its tidied text", async () => {
  await render();
  const held = deferred<TidyResult>();
  fixture.tidy.mockReturnValueOnce(held.promise);
  await click("Tidy up now");
  await click("a.md");
  expect(editor()!.getAttribute("aria-label")).toBe("Memory file memory/a.md");
  fixture.doc.mockImplementation(async (_id, path) => doc(path, `Tidied ${path}`, `tidied:${path}`));
  await act(async () => held.resolve(tidied()));
  await tick();
  expect(editor()!.getAttribute("aria-label")).toBe("Memory file memory/a.md");
  expect(editor()!.value).toBe("Tidied memory/a.md");
});

it("lets a selection still loading when Tidy finishes open the tidied file", async () => {
  await render();
  const heldTidy = deferred<TidyResult>();
  fixture.tidy.mockReturnValueOnce(heldTidy.promise);
  await click("Tidy up now");
  const beforeTidy = deferred<MemoryDoc>();
  fixture.doc.mockReturnValueOnce(beforeTidy.promise);
  await click("a.md");
  fixture.doc.mockImplementation(async (_id, path) => doc(path, `Tidied ${path}`, `tidied:${path}`));
  await act(async () => heldTidy.resolve(tidied()));
  await tick();
  await act(async () => beforeTidy.resolve(doc("memory/a.md", "Read before tidy", "stale-hash")));
  await tick();
  expect(editor()!.getAttribute("aria-label")).toBe("Memory file memory/a.md");
  expect(editor()!.value).toBe("Tidied memory/a.md");
});

it("still rereads the clean open document after Tidy", async () => {
  await render();
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Tidied index", "tidied-hash"));
  await click("Tidy up now");
  expect(editor()!.getAttribute("aria-label")).toBe("Bot memory");
  expect(editor()!.value).toBe("Tidied index");
  expect(container.textContent).toContain("Nothing to tidy.");
  expect(button("Tidy up now").disabled).toBe(false);
});

it("does not replace newer journal metadata with a delayed Tidy journal", async () => {
  await render();
  const heldJournal = deferred<MemoryJournalRow[]>();
  fixture.journal.mockReturnValueOnce(heldJournal.promise);
  await click("Tidy up now");
  await render(false);
  fixture.journal.mockResolvedValueOnce([row]);
  await render();
  expect(button("Undo").disabled).toBe(false);
  await act(async () => heldJournal.resolve([]));
  await tick();
  expect(container.textContent).not.toContain("No changes recorded yet.");
  expect(button("Undo").disabled).toBe(false);
});

it("keeps a file opened and edited while Delete of another file is pending", async () => {
  await render();
  await click("a.md");
  const held = deferred<{ overview: MemoryOverview }>();
  fixture.remove.mockReturnValueOnce(held.promise);
  await clickDelete("a.md");
  expect(fixture.remove).toHaveBeenCalledWith(bot.id, "memory/a.md");
  await click("b.md");
  await type("Draft in B");
  await act(async () => held.resolve({ overview: overview() }));
  await tick();
  expect(editor()).not.toBeNull();
  expect(editor()!.getAttribute("aria-label")).toBe("Memory file memory/b.md");
  expect(editor()!.value).toBe("Draft in B");
  expect(button("Save").disabled).toBe(false);
});

it("keeps text typed into a file after its Delete was confirmed", async () => {
  await render();
  await click("a.md");
  const held = deferred<{ overview: MemoryOverview }>();
  fixture.remove.mockReturnValueOnce(held.promise);
  await clickDelete("a.md");
  await type("Typed after confirming Delete");
  await act(async () => held.resolve({ overview: overview() }));
  await tick();
  expect(editor()).not.toBeNull();
  expect(editor()!.getAttribute("aria-label")).toBe("Memory file memory/a.md");
  expect(editor()!.value).toBe("Typed after confirming Delete");
  expect(button("Save").disabled).toBe(false);
});

it("still discards a draft that was already unsaved when its file's Delete was confirmed", async () => {
  await render();
  await click("a.md");
  await type("Unsaved before Delete");
  await clickDelete("a.md");
  expect(editor()).toBeNull();
});

it("lets a selection still loading when Delete finishes open its file", async () => {
  await render();
  await click("a.md");
  const heldDelete = deferred<{ overview: MemoryOverview }>();
  fixture.remove.mockReturnValueOnce(heldDelete.promise);
  await clickDelete("a.md");
  const heldDoc = deferred<MemoryDoc>();
  fixture.doc.mockReturnValueOnce(heldDoc.promise);
  await click("b.md");
  await act(async () => heldDelete.resolve({ overview: overview() }));
  await tick();
  await act(async () => heldDoc.resolve(doc("memory/b.md", "B after delete")));
  await tick();
  expect(editor()).not.toBeNull();
  expect(editor()!.getAttribute("aria-label")).toBe("Memory file memory/b.md");
  expect(editor()!.value).toBe("B after delete");
});

it("does not open a deleted file whose read was still loading", async () => {
  await render();
  const heldDelete = deferred<{ overview: MemoryOverview }>();
  fixture.remove.mockReturnValueOnce(heldDelete.promise);
  await clickDelete("a.md");
  const heldDoc = deferred<MemoryDoc>();
  fixture.doc.mockReturnValueOnce(heldDoc.promise);
  await click("a.md");
  await act(async () => heldDelete.resolve({ overview: overview() }));
  await tick();
  await act(async () => heldDoc.resolve({ path: "memory/a.md", text: "", hash: "empty", exists: false }));
  await tick();
  expect(editor()!.getAttribute("aria-label")).toBe("Bot memory");
  expect(editor()!.value).toBe("Saved MEMORY.md");
});

it("still closes the editor when its own file is deleted", async () => {
  await render();
  await click("a.md");
  await clickDelete("a.md");
  expect(editor()).toBeNull();
});

it("does not replace newer journal metadata with a delayed Delete journal", async () => {
  await render();
  const heldJournal = deferred<MemoryJournalRow[]>();
  fixture.journal.mockReturnValueOnce(heldJournal.promise);
  await clickDelete("a.md");
  await render(false);
  fixture.journal.mockResolvedValueOnce([row]);
  await render();
  expect(button("Undo").disabled).toBe(false);
  await act(async () => heldJournal.resolve([]));
  await tick();
  expect(container.textContent).not.toContain("No changes recorded yet.");
  expect(button("Undo").disabled).toBe(false);
});

// GrokOff modification (2026-10-10): real editor controls for held Save/Delete
// ordering and obsolete mutation callbacks after the mounted panel reactivates.
it("keeps newer typing dirty when a Save receipt arrives after its file was deleted", async () => {
  await render();
  await click("a.md");
  const heldDelete = deferred<{ overview: MemoryOverview }>();
  const heldSave = deferred<SaveResult>();
  fixture.remove.mockReturnValueOnce(heldDelete.promise);
  fixture.save.mockReturnValueOnce(heldSave.promise);
  await clickDelete("a.md");
  await type("Draft typed after Delete was confirmed");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "memory/a.md", "Draft typed after Delete was confirmed", "hash:memory/a.md");
  // The Save committed first, but its response is held until the later Delete
  // completes. The deleted disk is now empty; its old Save receipt is obsolete.
  await act(async () => heldDelete.resolve({ overview: overview() }));
  await tick();
  await act(async () => heldSave.resolve({ ok: true, doc: doc("memory/a.md", "Draft typed after Delete was confirmed", "committed-before-delete"), overview: overview() }));
  await tick();
  expect.soft(editor()?.value).toBe("Draft typed after Delete was confirmed");
  expect.soft(button("Save").disabled).toBe(false);
  fixture.doc.mockImplementation(async (_id, path) => ({ path, text: "", hash: "deleted-empty", exists: false }));
  await render(false);
  await render();
  expect(editor()?.value).toBe("Draft typed after Delete was confirmed");
  expect(button("Save").disabled).toBe(false);
});

it("does not close a clean same-path revision loaded by a newer activation after Delete", async () => {
  await render();
  await click("a.md");
  const heldDelete = deferred<{ overview: MemoryOverview }>();
  fixture.remove.mockReturnValueOnce(heldDelete.promise);
  await clickDelete("a.md");
  await render(false);
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "New activation revision", "new-activation-hash"));
  await render();
  expect(editor()?.value).toBe("New activation revision");
  await act(async () => heldDelete.resolve({ overview: overview() }));
  await tick();
  expect(editor()?.value).toBe("New activation revision");
  expect(editor()?.getAttribute("aria-label")).toBe("Memory file memory/a.md");
});

it("does not cancel a newer activation's same-path read when an old Delete finishes", async () => {
  await render();
  await click("a.md");
  const heldDelete = deferred<{ overview: MemoryOverview }>();
  fixture.remove.mockReturnValueOnce(heldDelete.promise);
  await clickDelete("a.md");
  await render(false);
  const newActivationRead = deferred<MemoryDoc>();
  fixture.doc.mockReturnValueOnce(newActivationRead.promise);
  await render();
  expect(fixture.doc).toHaveBeenLastCalledWith(bot.id, "memory/a.md");
  await act(async () => heldDelete.resolve({ overview: overview() }));
  await tick();
  await act(async () => newActivationRead.resolve(doc("memory/a.md", "New activation read", "new-read-hash")));
  await tick();
  expect(editor()?.value).toBe("New activation read");
});

it("does not reread or publish an old Tidy result after the panel reactivates", async () => {
  await render();
  const heldTidy = deferred<TidyResult>();
  fixture.tidy.mockReturnValueOnce(heldTidy.promise);
  await click("Tidy up now");
  await render(false);
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Current activation", "current-activation-hash"));
  await render();
  const docReads = fixture.doc.mock.calls.length;
  expect(editor()?.value).toBe("Current activation");
  await act(async () => heldTidy.resolve(tidied()));
  await tick();
  expect.soft(fixture.doc).toHaveBeenCalledTimes(docReads);
  expect.soft(container.textContent).not.toContain("Nothing to tidy.");
  expect(editor()?.value).toBe("Current activation");
  expect(button("Tidy up now").disabled).toBe(false);
});

it("does not resume old Tidy editor effects when activation expires during metadata refresh", async () => {
  await render();
  const heldJournal = deferred<MemoryJournalRow[]>();
  fixture.journal.mockReturnValueOnce(heldJournal.promise);
  await click("Tidy up now");
  await render(false);
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Current metadata activation", "current-metadata-hash"));
  await render();
  const docReads = fixture.doc.mock.calls.length;
  expect(editor()?.value).toBe("Current metadata activation");
  await act(async () => heldJournal.resolve([]));
  await tick();
  expect.soft(fixture.doc).toHaveBeenCalledTimes(docReads);
  expect.soft(container.textContent).not.toContain("Nothing to tidy.");
  expect(editor()?.value).toBe("Current metadata activation");
});

it("keeps an old Delete failure out of a newer activation", async () => {
  await render();
  await click("a.md");
  const heldDelete = deferred<{ overview: MemoryOverview }>();
  fixture.remove.mockReturnValueOnce(heldDelete.promise);
  await clickDelete("a.md");
  await render(false);
  await render();
  await act(async () => heldDelete.reject(new Error("Old Delete activation failed")));
  await tick();
  expect(container.textContent).not.toContain("Old Delete activation failed");
  expect(editor()?.value).toBe("Saved memory/a.md");
});

it("keeps an old Tidy failure out of a newer activation", async () => {
  await render();
  const heldTidy = deferred<TidyResult>();
  fixture.tidy.mockReturnValueOnce(heldTidy.promise);
  await click("Tidy up now");
  await render(false);
  await render();
  await act(async () => heldTidy.reject(new Error("Old Tidy activation failed")));
  await tick();
  expect(container.textContent).not.toContain("Old Tidy activation failed");
  expect(editor()?.value).toBe("Saved MEMORY.md");
  expect(button("Tidy up now").disabled).toBe(false);
});

it("keeps the newer draft dirty through Delete and held Save across reactivation", async () => {
  await render();
  await click("a.md");
  const heldDelete = deferred<{ overview: MemoryOverview }>();
  const heldSave = deferred<SaveResult>();
  fixture.remove.mockReturnValueOnce(heldDelete.promise);
  fixture.save.mockReturnValueOnce(heldSave.promise);
  await clickDelete("a.md");
  await type("Three-way newer draft");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "memory/a.md", "Three-way newer draft", "hash:memory/a.md");
  await render(false);
  await render();
  expect(editor()?.value).toBe("Three-way newer draft");
  await act(async () => heldDelete.resolve({ overview: overview() }));
  await tick();
  await act(async () => heldSave.resolve({ ok: true, doc: doc("memory/a.md", "Three-way newer draft", "committed-before-delete"), overview: overview() }));
  await tick();
  expect.soft(editor()?.value).toBe("Three-way newer draft");
  expect.soft(button("Save").disabled).toBe(false);
  fixture.doc.mockImplementation(async (_id, path) => ({ path, text: "", hash: "deleted-empty", exists: false }));
  await render(false);
  await render();
  expect(editor()?.value).toBe("Three-way newer draft");
  expect(button("Save").disabled).toBe(false);
});

it("lets a newer activation's freshly loaded revision finish its Save after old Delete", async () => {
  await render();
  await click("a.md");
  const heldDelete = deferred<{ overview: MemoryOverview }>();
  fixture.remove.mockReturnValueOnce(heldDelete.promise);
  await clickDelete("a.md");
  await render(false);
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Fresh current revision", "fresh-current-hash"));
  await render();
  expect(editor()?.value).toBe("Fresh current revision");
  const heldSave = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(heldSave.promise);
  await type("Saved in the new activation");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "memory/a.md", "Saved in the new activation", "fresh-current-hash");
  await act(async () => heldDelete.resolve({ overview: overview() }));
  await tick();
  await act(async () => heldSave.resolve({ ok: true, doc: doc("memory/a.md", "Saved in the new activation", "fresh-saved-hash"), overview: overview() }));
  await tick();
  expect(editor()?.value).toBe("Saved in the new activation");
  expect(button("Save").disabled).toBe(true);
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Saved in the new activation", "fresh-saved-hash"));
  await render(false);
  await render();
  await type("Next edit of the current revision");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "memory/a.md", "Next edit of the current revision", "fresh-saved-hash");
});

// GrokOff modification (2026-10-10): actual held Save/Tidy ordering controls; preserve a fresh activation revision.
const changedByTidy = (): TidyResult => ({ report: { ...report, expired: 1 }, overview: overview() });

it("keeps a draft dirty when its earlier Save receipt arrives after Tidy rewrites disk", async () => {
  await render();
  await click("a.md");
  const heldTidy = deferred<TidyResult>();
  const heldSave = deferred<SaveResult>();
  fixture.tidy.mockReturnValueOnce(heldTidy.promise);
  fixture.save.mockReturnValueOnce(heldSave.promise);
  await click("Tidy up now");
  await type("Draft saved before Tidy rewrote disk");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "memory/a.md", "Draft saved before Tidy rewrote disk", "hash:memory/a.md");
  // Save has committed, then Tidy expires a line. Only the responses are held.
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Tidied disk after expiring a note", "tidied-disk-hash"));
  await act(async () => heldTidy.resolve(changedByTidy()));
  await tick();
  await act(async () => heldSave.resolve({ ok: true, doc: doc("memory/a.md", "Draft saved before Tidy rewrote disk", "committed-before-tidy"), overview: overview() }));
  await tick();
  expect.soft(editor()?.value).toBe("Draft saved before Tidy rewrote disk");
  expect.soft(button("Save").disabled).toBe(false);
  await render(false);
  await render();
  expect(editor()?.value).toBe("Draft saved before Tidy rewrote disk");
  expect(button("Save").disabled).toBe(false);
});

it("keeps a retained dirty draft through Tidy and held Save across reactivation", async () => {
  await render();
  await click("a.md");
  const heldTidy = deferred<TidyResult>();
  const heldSave = deferred<SaveResult>();
  fixture.tidy.mockReturnValueOnce(heldTidy.promise);
  fixture.save.mockReturnValueOnce(heldSave.promise);
  await click("Tidy up now");
  await type("Retained Tidy three-way draft");
  await click("Save");
  await render(false);
  await render();
  expect(editor()?.value).toBe("Retained Tidy three-way draft");
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Tidied disk while hidden", "tidied-hidden-hash"));
  await act(async () => heldTidy.resolve(changedByTidy()));
  await tick();
  await act(async () => heldSave.resolve({ ok: true, doc: doc("memory/a.md", "Retained Tidy three-way draft", "committed-before-tidy"), overview: overview() }));
  await tick();
  expect.soft(editor()?.value).toBe("Retained Tidy three-way draft");
  expect.soft(button("Save").disabled).toBe(false);
  await render(false);
  await render();
  expect(editor()?.value).toBe("Retained Tidy three-way draft");
  expect(button("Save").disabled).toBe(false);
});

it("lets a newer activation's distinct loaded revision finish its Save after an old Tidy response", async () => {
  await render();
  await click("a.md");
  const heldTidy = deferred<TidyResult>();
  fixture.tidy.mockReturnValueOnce(heldTidy.promise);
  await click("Tidy up now");
  // Tidy's disk rewrite already happened; only its response is delayed. The
  // next activation loads that distinct revision and Save commits after it.
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Fresh tidied revision", "fresh-tidied-hash"));
  await render(false);
  await render();
  expect(editor()?.value).toBe("Fresh tidied revision");
  const heldSave = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(heldSave.promise);
  await type("New activation Save after disk Tidy");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "memory/a.md", "New activation Save after disk Tidy", "fresh-tidied-hash");
  await act(async () => heldTidy.resolve({ report: { ...report, organized: 1 }, overview: overview() }));
  await tick();
  await act(async () => heldSave.resolve({ ok: true, doc: doc("memory/a.md", "New activation Save after disk Tidy", "fresh-saved-hash"), overview: overview() }));
  await tick();
  expect(editor()?.value).toBe("New activation Save after disk Tidy");
  expect(button("Save").disabled).toBe(true);
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "New activation Save after disk Tidy", "fresh-saved-hash"));
  await render(false);
  await render();
  await type("Next edit after current Save");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "memory/a.md", "Next edit after current Save", "fresh-saved-hash");
});

it("keeps a newly selected file dirty when its Save receipt predates the current Tidy rewrite", async () => {
  await render();
  const heldTidy = deferred<TidyResult>();
  const heldSave = deferred<SaveResult>();
  fixture.tidy.mockReturnValueOnce(heldTidy.promise);
  fixture.save.mockReturnValueOnce(heldSave.promise);
  await click("Tidy up now");
  await click("a.md");
  await type("Selected after Tidy started, saved before rewrite");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "memory/a.md", "Selected after Tidy started, saved before rewrite", "hash:memory/a.md");
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Tidied newly selected file on disk", "tidied-selected-hash"));
  await act(async () => heldTidy.resolve(changedByTidy()));
  await tick();
  await act(async () => heldSave.resolve({ ok: true, doc: doc("memory/a.md", "Selected after Tidy started, saved before rewrite", "committed-before-tidy"), overview: overview() }));
  await tick();
  expect.soft(editor()?.value).toBe("Selected after Tidy started, saved before rewrite");
  expect.soft(button("Save").disabled).toBe(false);
  await render(false);
  await render();
  expect(editor()?.getAttribute("aria-label")).toBe("Memory file memory/a.md");
  expect(editor()?.value).toBe("Selected after Tidy started, saved before rewrite");
  expect(button("Save").disabled).toBe(false);
});

it("keeps a fresh same-activation Save started after Tidy success while metadata waits", async () => {
  await render();
  const heldTidy = deferred<TidyResult>();
  const heldMetadata = deferred<MemoryJournalRow[]>();
  fixture.tidy.mockReturnValueOnce(heldTidy.promise);
  fixture.journal.mockReturnValueOnce(heldMetadata.promise);
  await click("Tidy up now");
  // Disk changed before the Tidy response. Only journal metadata is delayed
  // now; this explicit reread and Save own the later tidied revision.
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Fresh disk after Tidy success", "post-tidy-read-hash"));
  await act(async () => heldTidy.resolve(changedByTidy()));
  await tick();
  expect(button("Tidying…").disabled).toBe(true);
  await click("a.md");
  expect(editor()?.value).toBe("Fresh disk after Tidy success");
  const heldSave = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(heldSave.promise);
  await type("Valid Save begun after Tidy committed");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "memory/a.md", "Valid Save begun after Tidy committed", "post-tidy-read-hash");
  await act(async () => heldMetadata.resolve([]));
  await tick();
  expect(editor()?.value).toBe("Valid Save begun after Tidy committed");
  await act(async () => heldSave.resolve({ ok: true, doc: doc("memory/a.md", "Valid Save begun after Tidy committed", "valid-post-tidy-save-hash"), overview: overview() }));
  await tick();
  expect(editor()?.value).toBe("Valid Save begun after Tidy committed");
  expect(button("Save").disabled).toBe(true);
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Valid Save begun after Tidy committed", "valid-post-tidy-save-hash"));
  await render(false);
  await render();
  await type("Next edit after post-Tidy Save");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "memory/a.md", "Next edit after post-Tidy Save", "valid-post-tidy-save-hash");
});


it("keeps a post-Tidy selection's dirty Save obsolete across a later activation", async () => {
  await render();
  const heldTidy = deferred<TidyResult>();
  const heldSave = deferred<SaveResult>();
  fixture.tidy.mockReturnValueOnce(heldTidy.promise);
  fixture.save.mockReturnValueOnce(heldSave.promise);
  await click("Tidy up now");
  await click("a.md");
  await type("New selection retained across activation during Tidy");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "memory/a.md", "New selection retained across activation during Tidy", "hash:memory/a.md");
  await render(false);
  await render();
  expect(editor()?.value).toBe("New selection retained across activation during Tidy");
  // This Save committed first. Tidy then rewrote the file; its editor was
  // loaded after the Tidy click but under that original activation.
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Tidied retained selection on disk", "tidied-retained-selection-hash"));
  await act(async () => heldTidy.resolve(changedByTidy()));
  await tick();
  await act(async () => heldSave.resolve({ ok: true, doc: doc("memory/a.md", "New selection retained across activation during Tidy", "committed-before-tidy"), overview: overview() }));
  await tick();
  expect.soft(editor()?.value).toBe("New selection retained across activation during Tidy");
  expect.soft(button("Save").disabled).toBe(false);
  await render(false);
  await render();
  expect(editor()?.value).toBe("New selection retained across activation during Tidy");
  expect(button("Save").disabled).toBe(false);
});


it("keeps a later-loaded deleted file's draft dirty through Save and reactivation", async () => {
  await render();
  const heldDelete = deferred<{ overview: MemoryOverview }>();
  const heldSave = deferred<SaveResult>();
  fixture.remove.mockReturnValueOnce(heldDelete.promise);
  fixture.save.mockReturnValueOnce(heldSave.promise);
  await clickDelete("a.md");
  await click("a.md");
  await type("Loaded after Delete click, retained while Save waits");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "memory/a.md", "Loaded after Delete click, retained while Save waits", "hash:memory/a.md");
  await render(false);
  await render();
  expect(editor()?.value).toBe("Loaded after Delete click, retained while Save waits");
  // Save committed before Delete; the deleted disk is now empty. Its editor
  // was loaded after Delete was clicked, but under Delete's old activation.
  fixture.doc.mockImplementation(async (_id, path) => ({ path, text: "", hash: "deleted-empty", exists: false }));
  await act(async () => heldDelete.resolve({ overview: overview() }));
  await tick();
  await act(async () => heldSave.resolve({ ok: true, doc: doc("memory/a.md", "Loaded after Delete click, retained while Save waits", "committed-before-delete"), overview: overview() }));
  await tick();
  expect.soft(editor()?.value).toBe("Loaded after Delete click, retained while Save waits");
  expect.soft(button("Save").disabled).toBe(false);
  await render(false);
  await render();
  expect(editor()?.value).toBe("Loaded after Delete click, retained while Save waits");
  expect(button("Save").disabled).toBe(false);
});

// GrokOff modification (2026-10-10): later-activation housekeeping preserves an earlier loaded retained draft against obsolete Save receipts.

it("keeps an earlier activation's retained draft dirty after later-activation Tidy and held Save", async () => {
  await render();
  await click("a.md");
  await type("Dirty document loaded before reopening Settings");
  await render(false);
  await render();
  expect(editor()?.value).toBe("Dirty document loaded before reopening Settings");
  const heldTidy = deferred<TidyResult>();
  const heldSave = deferred<SaveResult>();
  fixture.tidy.mockReturnValueOnce(heldTidy.promise);
  fixture.save.mockReturnValueOnce(heldSave.promise);
  await click("Tidy up now");
  await type("Retained document saved before newer Tidy rewrote disk");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "memory/a.md", "Retained document saved before newer Tidy rewrote disk", "hash:memory/a.md");
  await render(false);
  await render();
  // The prior Save committed, then the newer activation's Tidy rewrote disk.
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Later activation tidied disk", "later-activation-tidied-hash"));
  await act(async () => heldTidy.resolve(changedByTidy()));
  await tick();
  await act(async () => heldSave.resolve({ ok: true, doc: doc("memory/a.md", "Retained document saved before newer Tidy rewrote disk", "committed-before-newer-tidy"), overview: overview() }));
  await tick();
  expect.soft(editor()?.value).toBe("Retained document saved before newer Tidy rewrote disk");
  expect.soft(button("Save").disabled).toBe(false);
  await render(false);
  await render();
  expect(editor()?.value).toBe("Retained document saved before newer Tidy rewrote disk");
  expect(button("Save").disabled).toBe(false);
});

it("keeps an earlier activation's retained draft dirty after later-activation Delete and held Save", async () => {
  await render();
  await click("a.md");
  await type("Dirty document loaded before reopening Settings");
  await render(false);
  await render();
  expect(editor()?.value).toBe("Dirty document loaded before reopening Settings");
  const heldDelete = deferred<{ overview: MemoryOverview }>();
  const heldSave = deferred<SaveResult>();
  fixture.remove.mockReturnValueOnce(heldDelete.promise);
  fixture.save.mockReturnValueOnce(heldSave.promise);
  await clickDelete("a.md");
  // Typing after confirming Delete is newer and must not be discarded.
  await type("Retained document typed after newer Delete click");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "memory/a.md", "Retained document typed after newer Delete click", "hash:memory/a.md");
  await render(false);
  await render();
  fixture.doc.mockImplementation(async (_id, path) => ({ path, text: "", hash: "later-activation-deleted-empty", exists: false }));
  await act(async () => heldDelete.resolve({ overview: overview() }));
  await tick();
  await act(async () => heldSave.resolve({ ok: true, doc: doc("memory/a.md", "Retained document typed after newer Delete click", "committed-before-newer-delete"), overview: overview() }));
  await tick();
  expect.soft(editor()?.value).toBe("Retained document typed after newer Delete click");
  expect.soft(button("Save").disabled).toBe(false);
  await render(false);
  await render();
  expect(editor()?.value).toBe("Retained document typed after newer Delete click");
  expect(button("Save").disabled).toBe(false);
});

// GrokOff modification (2026-10-10): committed Tidy refreshes editor ownership independently of metadata-read failure.

it("rereads the pending selection after Tidy succeeds even when journal metadata fails", async () => {
  await render();
  const oldSelection = deferred<MemoryDoc>();
  fixture.doc.mockReturnValueOnce(oldSelection.promise);
  await click("a.md");
  expect(fixture.doc).toHaveBeenLastCalledWith(bot.id, "memory/a.md");
  const heldTidy = deferred<TidyResult>();
  const heldJournal = deferred<MemoryJournalRow[]>();
  fixture.tidy.mockReturnValueOnce(heldTidy.promise);
  fixture.journal.mockReturnValueOnce(heldJournal.promise);
  await click("Tidy up now");
  // Tidy has changed the file. A reissue now returns its real new revision;
  // the already-held selection still carries the pre-Tidy snapshot.
  fixture.doc.mockImplementation(async (_id, path) => doc(path, "Fresh tidied selection after mutation", "fresh-after-tidy-hash"));
  await act(async () => heldTidy.resolve({ report: { ...report, expired: 1 }, overview: overview() }));
  await tick();
  await act(async () => heldJournal.reject(new Error("Journal refresh failed after Tidy committed")));
  await tick();
  await act(async () => oldSelection.resolve(doc("memory/a.md", "Old read from before Tidy", "old-pre-tidy-hash")));
  await tick();
  expect.soft(fixture.doc.mock.calls.filter(([, path]) => path === "memory/a.md")).toHaveLength(2);
  expect.soft(editor()?.getAttribute("aria-label")).toBe("Memory file memory/a.md");
  expect.soft(editor()?.value).toBe("Fresh tidied selection after mutation");
  expect.soft(container.textContent).toContain("Journal refresh failed after Tidy committed");
  // Exercise the next real Save to prove the visible text carries the fresh
  // revision hash, rather than only masking a late snapshot in the display.
  await type("Edited from the tidied revision");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "memory/a.md", "Edited from the tidied revision", "fresh-after-tidy-hash");
});
