// @vitest-environment happy-dom
// GrokOff: actual memory editor read/Save/Undo ownership and fresh mutation metadata with deferred in-memory responses.
// Transport, Store dispatch and desktop capabilities are sealed synthetic seams;
// no provider, server, filesystem, account, native UI or background model calls.
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Bot } from "@/state/store";
import type { MemoryDoc, MemoryJournalRow, MemoryOverview, SaveResult } from "@/lib/memory";
import { setLocale } from "@/lib/i18n";
import { MemorySection } from "./MemorySection";

const fixture = vi.hoisted(() => ({
  dispatch: vi.fn(),
  overview: vi.fn<(botId: string) => Promise<MemoryOverview>>(),
  journal: vi.fn<(botId: string) => Promise<MemoryJournalRow[]>>(),
  doc: vi.fn<(botId: string, path: string) => Promise<MemoryDoc>>(),
  save: vi.fn<(botId: string, path: string, text: string, hash: string | undefined) => Promise<SaveResult>>(),
  revert: vi.fn<(botId: string, entryId: string) => Promise<MemoryDoc & { overview: MemoryOverview }>>(),
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
  revertMemoryChange: fixture.revert,
  fetchUpkeepStatus: async () => null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const doc = (path = "MEMORY.md", text = `Saved ${path}`, hash = `hash:${path}`): MemoryDoc => ({ path, text, hash, exists: true });
const bot: Bot = { id: "memory-fixture", threadId: "memory-thread", name: "Fixture", title: "", description: "", color: "green", unread: false, notifications: false, messages: [], memoryUpkeep: false, modelSelection: { instanceId: "synthetic", model: "unused" } };
const overview = (workspacePath = "/synthetic/current"): MemoryOverview => ({
  botId: bot.id, workspacePath,
  index: { lines: 1, bytes: 10, loadedLines: 1, loadedBytes: 10, maxLines: 200, maxBytes: 24_000, truncated: false, hash: "index-hash" },
  topics: ["a", "b"].map(name => ({ path: `memory/${name}.md`, name: `${name}.md`, bytes: 10, modifiedAt: 1 })),
  logs: [{ path: "memory/log/synthetic.md", name: "synthetic.md", bytes: 10, modifiedAt: 1 }],
});
const row: MemoryJournalRow = { id: "change", at: 1, botId: bot.id, path: "MEMORY.md", actor: "person", via: "ui", kind: "edited", beforeHash: "before", afterHash: "after", diff: "", added: 1, removed: 0, canRevert: true };
let root: Root;
let container: HTMLDivElement;
let mounted: boolean;
const tick = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const button = (label: string) => {
  const result = [...container.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent?.trim() === label || el.querySelector("span")?.textContent === label);
  expect(result, label).toBeDefined();
  return result!;
};
const editor = () => container.querySelector<HTMLTextAreaElement>("textarea")!;
const click = async (label: string) => { act(() => button(label).click()); await tick(); };
const type = async (value: string, input: HTMLInputElement | HTMLTextAreaElement = editor()) => {
  const prototype = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await tick();
};
const render = async (active = true) => { await act(async () => root.render(createElement(MemorySection, { bot, active, onToggle: fixture.dispatch }))); await tick(); };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected fixture transport"); }));
  setLocale("en");
  fixture.dispatch.mockReset();
  fixture.overview.mockReset().mockResolvedValue(overview());
  fixture.journal.mockReset().mockResolvedValue([]);
  fixture.doc.mockReset().mockImplementation(async (_id, path) => doc(path));
  fixture.save.mockReset().mockImplementation(async (_id, path, text) => ({ ok: true, doc: doc(path, text, "saved-hash"), overview: overview() }));
  fixture.revert.mockReset().mockResolvedValue({ ...doc("MEMORY.md", "Reverted text", "revert-hash"), overview: overview() });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mounted = true;
});
afterEach(() => {
  if (mounted) act(() => root.unmount());
  container.remove();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it("keeps the newer topic and its unsaved draft after an older topic read resolves", async () => {
  await render();
  const held = deferred<MemoryDoc>();
  fixture.doc.mockImplementation(async (_id, path) => path === "memory/a.md" ? held.promise : doc(path));
  await click("a.md");
  await click("b.md");
  await type("My newer B draft");
  expect(button("Save").disabled).toBe(false);
  await act(async () => held.resolve(doc("memory/a.md", "Obsolete A")));
  await tick();
  expect(editor().getAttribute("aria-label")).toBe("Memory file memory/b.md");
  expect(editor().value).toBe("My newer B draft");
  expect(button("Save").disabled).toBe(false);
});

it("does not replace a typed index draft with a held reactivation document", async () => {
  await render();
  await render(false);
  const held = deferred<MemoryDoc>();
  fixture.doc.mockReturnValueOnce(held.promise);
  await render();
  await type("Keep these explicit preferences");
  await act(async () => held.resolve(doc("MEMORY.md", "Older preferences")));
  await tick();
  expect(editor().value).toBe("Keep these explicit preferences");
  expect(button("Save").disabled).toBe(false);
});

it("ignores old activation metadata after a new activation has loaded", async () => {
  const held = deferred<MemoryOverview>();
  fixture.overview.mockReturnValueOnce(held.promise);
  await render();
  await render(false);
  await render();
  await type("Current draft");
  await act(async () => held.resolve(overview("/synthetic/obsolete")));
  await tick();
  expect(container.textContent).not.toContain("/synthetic/obsolete");
  expect(editor().value).toBe("Current draft");
});

it("ignores an old activation's document while the panel is inactive", async () => {
  const held = deferred<MemoryDoc>();
  fixture.doc.mockReturnValueOnce(held.promise);
  await render();
  await render(false);
  await act(async () => held.resolve(doc("MEMORY.md", "Inactive response")));
  await tick();
  expect(editor()).toBeNull();
  await render();
  expect(editor().value).toBe("Saved MEMORY.md");
});

it.each(["selection", "typing", "inactive"] as const)("ignores a rejected old read after %s changes its ownership", async intent => {
  await render();
  const held = deferred<MemoryDoc>();
  fixture.doc.mockReturnValueOnce(held.promise);
  await click("a.md");
  if (intent === "selection") await click("b.md");
  if (intent === "typing") await type("Keep current index draft");
  if (intent === "inactive") await render(false);
  await act(async () => held.reject(new Error("Obsolete read failure")));
  await tick();
  expect(container.textContent).not.toContain("Obsolete read failure");
});

it("shows current document and activation failures and allows a current read to recover", async () => {
  fixture.overview.mockRejectedValueOnce(new Error("Current overview refused"));
  await render();
  expect(container.textContent).toContain("Current overview refused");
  await render(false);
  await render();
  fixture.doc.mockRejectedValueOnce(new Error("Current file refused"));
  await click("a.md");
  expect(container.textContent).toContain("Current file refused");
  await click("b.md");
  expect(editor().value).toBe("Saved memory/b.md");
  expect(container.textContent).not.toContain("Current file refused");
});

it("keeps a dirty draft across inactive/reactivated sections without rereading its document", async () => {
  await render();
  await type("Unsaved preferences");
  const reads = fixture.doc.mock.calls.length;
  await render(false);
  await render();
  expect(editor().value).toBe("Unsaved preferences");
  expect(button("Save").disabled).toBe(false);
  expect(fixture.doc).toHaveBeenCalledTimes(reads);
  expect(fixture.overview).toHaveBeenCalledTimes(2);
});

it("keeps New topic follow-through from marking a newer selected file dirty", async () => {
  await render();
  const held = deferred<MemoryDoc>();
  fixture.doc.mockImplementation(async (_id, path) => path === "memory/new-topic.md" ? held.promise : doc(path));
  await type("new-topic", container.querySelector<HTMLInputElement>('input[placeholder="New topic name, e.g. clients"]')!);
  await click("New topic");
  await click("b.md");
  await act(async () => held.resolve({ ...doc("memory/new-topic.md", ""), exists: false }));
  await tick();
  expect(editor().getAttribute("aria-label")).toBe("Memory file memory/b.md");
  expect(editor().value).toBe("Saved memory/b.md");
  expect(button("Save").disabled).toBe(true);
});

it("still opens a current new topic as a dirty template", async () => {
  await render();
  fixture.doc.mockResolvedValueOnce({ ...doc("memory/new-topic.md", ""), exists: false });
  await type("new-topic", container.querySelector<HTMLInputElement>('input[placeholder="New topic name, e.g. clients"]')!);
  await click("New topic");
  expect(editor().getAttribute("aria-label")).toBe("Memory file memory/new-topic.md");
  expect(editor().value).toContain("title: new-topic");
  expect(button("Save").disabled).toBe(false);
});

it("preserves current save payload/hash and ignores a read older than the completed save", async () => {
  await render();
  await type("Saved explicit preference");
  const held = deferred<MemoryDoc>();
  fixture.doc.mockReturnValueOnce(held.promise);
  await click("a.md");
  await click("Save");
  expect(fixture.save).toHaveBeenCalledWith(bot.id, "MEMORY.md", "Saved explicit preference", "hash:MEMORY.md");
  await act(async () => held.resolve(doc("memory/a.md", "Before save")));
  await tick();
  expect(editor().value).toBe("Saved explicit preference");
  expect(button("Save").disabled).toBe(true);
});

it("retains conflict reload and its saved draft after an older read finishes", async () => {
  await render();
  await type("My conflict draft");
  const held = deferred<MemoryDoc>();
  fixture.doc.mockReturnValueOnce(held.promise);
  await click("a.md");
  fixture.save.mockResolvedValueOnce({ ok: false, conflict: true, current: "Newer on disk", currentHash: "disk-hash" });
  await click("Save");
  await click("Reload");
  await act(async () => held.resolve(doc("memory/a.md", "Before conflict")));
  await tick();
  expect(editor().value).toBe("Newer on disk");
  expect(container.querySelector("pre")?.textContent).toBe("My conflict draft");
  expect(button("Save").disabled).toBe(true);
});

it("preserves current undo and prevents a pending older read from replacing its restored document", async () => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  const held = deferred<MemoryDoc>();
  fixture.doc.mockReturnValueOnce(held.promise);
  await click("a.md");
  await click("Undo");
  expect(fixture.revert).toHaveBeenCalledWith(bot.id, row.id);
  await act(async () => held.resolve(doc("memory/a.md", "Before undo")));
  await tick();
  expect(editor().value).toBe("Reverted text");
  expect(container.textContent).toContain("Put MEMORY.md back the way it was.");
});

it("settles a held response quietly after unmount", async () => {
  const held = deferred<MemoryDoc>();
  fixture.doc.mockReturnValueOnce(held.promise);
  await render();
  act(() => root.unmount());
  mounted = false;
  await act(async () => held.resolve(doc("MEMORY.md", "After unmount")));
  await tick();
  expect(container.childElementCount).toBe(0);
});

it("retains the current read across StrictMode effect cleanup and ignores the first activation", async () => {
  const old = deferred<MemoryOverview>();
  fixture.overview.mockReturnValueOnce(old.promise);
  await act(async () => root.render(createElement(StrictMode, null, createElement(MemorySection, { bot, onToggle: fixture.dispatch }))));
  await tick();
  expect(editor().value).toBe("Saved MEMORY.md");
  await type("StrictMode current draft");
  await act(async () => old.resolve(overview("/synthetic/strict-obsolete")));
  await tick();
  expect(container.textContent).not.toContain("/synthetic/strict-obsolete");
  expect(editor().value).toBe("StrictMode current draft");
});

it("still discards the current draft and keeps daily logs read-only", async () => {
  await render();
  await type("A draft to discard");
  await click("Discard changes");
  expect(editor().value).toBe("Saved MEMORY.md");
  expect(button("Save").disabled).toBe(true);
  await click("synthetic.md");
  expect(editor().readOnly).toBe(true);
  expect(container.textContent).toContain("Daily logs are the bot's own record");
  expect([...container.querySelectorAll("button")].some(el => el.textContent?.trim() === "Save")).toBe(false);
});

it("refreshes current metadata while typing into a draft preserved on reactivation", async () => {
  await render();
  await type("Preserved draft");
  await render(false);
  const held = deferred<MemoryOverview>();
  fixture.overview.mockReturnValueOnce(held.promise);
  await render();
  await type("Preserved draft with newer typing");
  await act(async () => held.resolve(overview("/synthetic/new-metadata")));
  await tick();
  expect(container.textContent).toContain("/synthetic/new-metadata");
  expect(editor().value).toBe("Preserved draft with newer typing");
  expect(button("Save").disabled).toBe(false);
});

it("retains current reactivation metadata when conflict Reload changes only the local editor", async () => {
  await render();
  await type("Conflict draft to retain");
  fixture.save.mockResolvedValueOnce({ ok: false, conflict: true, current: "Conflict disk version", currentHash: "reload-hash" });
  await click("Save");
  await render(false);
  const held = deferred<MemoryOverview>();
  fixture.overview.mockReturnValueOnce(held.promise);
  await render();
  await click("Reload");
  await act(async () => held.resolve(overview("/synthetic/reloaded-metadata")));
  await tick();
  expect(container.textContent).toContain("/synthetic/reloaded-metadata");
  expect(editor().value).toBe("Conflict disk version");
  expect(container.querySelector("pre")?.textContent).toBe("Conflict draft to retain");
});

it("keeps current metadata when a rejected Save reports a conflict during reactivation", async () => {
  await render();
  await type("Draft before held reactivation");
  await render(false);
  const held = deferred<MemoryOverview>();
  fixture.overview.mockReturnValueOnce(held.promise);
  await render();
  fixture.save.mockResolvedValueOnce({ ok: false, conflict: true, current: "Concurrent disk edit", currentHash: "concurrent-hash" });
  await click("Save");
  await act(async () => held.resolve(overview("/synthetic/conflict-metadata")));
  await tick();
  expect(container.textContent).toContain("/synthetic/conflict-metadata");
  expect(editor().value).toBe("Draft before held reactivation");
  expect(button("Reload").disabled).toBe(false);
});


it("keeps typing during a held Save dirty and uses the saved hash for the next Save", async () => {
  await render();
  await type("Submitted text");
  const held = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(held.promise);
  await click("Save");
  await type("Newer typing during Save");
  await act(async () => held.resolve({ ok: true, doc: doc("MEMORY.md", "Submitted text", "first-save-hash"), overview: overview() }));
  await tick();
  expect(editor().value).toBe("Newer typing during Save");
  expect(button("Save").disabled).toBe(false);
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "MEMORY.md", "Newer typing during Save", "first-save-hash");
  expect(button("Save").disabled).toBe(true);
});

it("leaves a later selected document and its draft/hash untouched after a held Save", async () => {
  await render();
  await type("Submitted index");
  const held = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(held.promise);
  await click("Save");
  await click("b.md");
  await type("Newer B draft");
  await act(async () => held.resolve({ ok: true, doc: doc("MEMORY.md", "Submitted index", "saved-index-hash"), overview: overview() }));
  await tick();
  expect(editor().getAttribute("aria-label")).toBe("Memory file memory/b.md");
  expect(editor().value).toBe("Newer B draft");
  expect(button("Save").disabled).toBe(false);
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "memory/b.md", "Newer B draft", "hash:memory/b.md");
});

it("allows a selection started after Save to finish after the Save succeeds", async () => {
  await render();
  await type("Submitted index");
  const saved = deferred<SaveResult>();
  const selected = deferred<MemoryDoc>();
  fixture.save.mockReturnValueOnce(saved.promise);
  await click("Save");
  fixture.doc.mockReturnValueOnce(selected.promise);
  await click("b.md");
  await act(async () => saved.resolve({ ok: true, doc: doc("MEMORY.md", "Submitted index", "saved-index-hash"), overview: overview() }));
  await tick();
  await act(async () => selected.resolve(doc("memory/b.md", "Selected B", "b-current-hash")));
  await tick();
  expect(editor().value).toBe("Selected B");
  expect(editor().getAttribute("aria-label")).toBe("Memory file memory/b.md");
});

it("preserves a newer same-path read hash instead of rewinding it to a held Save receipt", async () => {
  await render();
  await click("a.md");
  await type("Submitted A");
  const held = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(held.promise);
  await click("Save");
  fixture.doc.mockResolvedValueOnce(doc("memory/a.md", "More recent disk A", "newer-a-hash"));
  await click("a.md");
  await type("Draft on newer A");
  await act(async () => held.resolve({ ok: true, doc: doc("memory/a.md", "Submitted A", "older-save-hash"), overview: overview() }));
  await tick();
  expect(editor().value).toBe("Draft on newer A");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "memory/a.md", "Draft on newer A", "newer-a-hash");
});

it.each(["conflict", "error"] as const)("does not project an old Save %s onto a later selected file", async outcome => {
  await render();
  await type("Submitted index");
  const held = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(held.promise);
  await click("Save");
  await click("b.md");
  await type("Keep B draft");
  await act(async () => {
    if (outcome === "conflict") held.resolve({ ok: false, conflict: true, current: "Old index conflict", currentHash: "index-conflict-hash" });
    else held.reject(new Error("Old index Save failure"));
  });
  await tick();
  expect(editor().value).toBe("Keep B draft");
  expect(container.textContent).not.toContain("Old index Save failure");
  expect([...container.querySelectorAll("button")].some(el => el.textContent?.trim() === "Reload")).toBe(false);
});


it("does not rewind a same-path revision loaded and then restored while Save is pending", async () => {
  fixture.journal.mockResolvedValue([{ ...row, path: "memory/a.md" }]);
  fixture.revert.mockResolvedValue({ ...doc("memory/a.md", "Restored A", "revert-hash"), overview: overview() });
  await render();
  await click("a.md");
  await type("Submitted A");
  const held = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(held.promise);
  await click("Save");
  fixture.doc.mockResolvedValueOnce(doc("memory/a.md", "Newer A", "newer-a-hash"));
  await click("a.md");
  await click("Undo");
  expect(editor().value).toBe("Restored A");
  await type("Draft on restored revision");
  await act(async () => held.resolve({ ok: true, doc: doc("memory/a.md", "Submitted A", "older-save-hash"), overview: overview() }));
  await tick();
  expect(editor().value).toBe("Draft on restored revision");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "memory/a.md", "Draft on restored revision", "revert-hash");
});

it("keeps newer typing through a current held Save conflict and retains it on Reload", async () => {
  await render();
  await type("Submitted index");
  const held = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(held.promise);
  await click("Save");
  await type("Current conflict draft");
  await act(async () => held.resolve({ ok: false, conflict: true, current: "Concurrent disk text", currentHash: "disk-hash" }));
  await tick();
  expect(editor().value).toBe("Current conflict draft");
  await click("Reload");
  expect(editor().value).toBe("Concurrent disk text");
  expect(container.querySelector("pre")?.textContent).toBe("Current conflict draft");
});

it("does not replace newer refreshed journal metadata with a delayed Save journal", async () => {
  await render();
  await type("Saved text");
  const heldJournal = deferred<MemoryJournalRow[]>();
  fixture.journal.mockReturnValueOnce(heldJournal.promise);
  await click("Save");
  await render(false);
  fixture.journal.mockResolvedValueOnce([{ ...row, id: "current", path: "memory/b.md" }]);
  await render();
  expect(container.textContent).toContain("the b topic");
  await act(async () => heldJournal.resolve([]));
  await tick();
  expect(container.textContent).not.toContain("No changes recorded yet.");
  expect(button("Undo").disabled).toBe(false);
});


it("does not clear a retained unsaved draft when an old Save settles after navigation", async () => {
  await render();
  await type("Retained conflict draft");
  fixture.save.mockResolvedValueOnce({ ok: false, conflict: true, current: "Disk text", currentHash: "disk-hash" });
  await click("Save");
  await click("Reload");
  expect(container.querySelector("pre")?.textContent).toBe("Retained conflict draft");
  await type("Submitted after Reload");
  const held = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(held.promise);
  await click("Save");
  await click("b.md");
  await type("Keep B text");
  await act(async () => held.resolve({ ok: true, doc: doc("MEMORY.md", "Submitted after Reload", "saved-index"), overview: overview() }));
  await tick();
  expect(container.querySelector("pre")?.textContent).toBe("Retained conflict draft");
  expect(editor().value).toBe("Keep B text");
});


it.each(["hidden", "reopened"] as const)("advances a preserved draft's saved hash when the panel is %s", async visibility => {
  await render();
  await type("Submitted before hiding");
  const held = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(held.promise);
  await click("Save");
  await type("Newer preserved draft");
  await render(false);
  if (visibility === "reopened") await render();
  await act(async () => held.resolve({ ok: true, doc: doc("MEMORY.md", "Submitted before hiding", "hidden-save-hash"), overview: overview() }));
  await tick();
  if (visibility === "hidden") await render();
  expect(editor().value).toBe("Newer preserved draft");
  expect(button("Save").disabled).toBe(false);
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "MEMORY.md", "Newer preserved draft", "hidden-save-hash");
});


it("advances the saved hash when typing cancels a later pending selection", async () => {
  await render();
  await type("Submitted A");
  const saved = deferred<SaveResult>();
  const selected = deferred<MemoryDoc>();
  fixture.save.mockReturnValueOnce(saved.promise);
  await click("Save");
  fixture.doc.mockReturnValueOnce(selected.promise);
  await click("b.md");
  await type("Still editing A");
  await act(async () => saved.resolve({ ok: true, doc: doc("MEMORY.md", "Submitted A", "saved-a-hash"), overview: overview() }));
  await tick();
  await act(async () => selected.resolve(doc("memory/b.md", "Cancelled B")));
  await tick();
  expect(editor().value).toBe("Still editing A");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "MEMORY.md", "Still editing A", "saved-a-hash");
});

it("lets newer reactivation metadata and its selected document finish after an old Save", async () => {
  await render();
  await type("Submitted index");
  const saved = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(saved.promise);
  await click("Save");
  await click("b.md");
  await render(false);
  const metadata = deferred<MemoryOverview>();
  fixture.overview.mockReturnValueOnce(metadata.promise);
  fixture.doc.mockResolvedValueOnce(doc("memory/b.md", "Fresh reactivated B", "fresh-b-hash"));
  await render();
  await act(async () => saved.resolve({ ok: true, doc: doc("MEMORY.md", "Submitted index", "saved-index"), overview: overview() }));
  await tick();
  await act(async () => metadata.resolve(overview("/synthetic/reactivated-b")));
  await tick();
  expect(editor().value).toBe("Fresh reactivated B");
  expect(container.textContent).toContain("/synthetic/reactivated-b");
});

it.each(["conflict", "error"] as const)("keeps a current Save %s visible after typing cancels pending navigation", async outcome => {
  await render();
  await type("Submitted A");
  const saved = deferred<SaveResult>();
  const selected = deferred<MemoryDoc>();
  fixture.save.mockReturnValueOnce(saved.promise);
  await click("Save");
  fixture.doc.mockReturnValueOnce(selected.promise);
  await click("b.md");
  await type("Current A draft");
  await act(async () => {
    if (outcome === "conflict") saved.resolve({ ok: false, conflict: true, current: "Concurrent A", currentHash: "concurrent-a-hash" });
    else saved.reject(new Error("Current A Save failure"));
  });
  await tick();
  if (outcome === "conflict") expect(button("Reload").disabled).toBe(false);
  else expect(container.textContent).toContain("Current A Save failure");
  await act(async () => selected.resolve(doc("memory/b.md", "Cancelled B")));
  await tick();
  expect(editor().value).toBe("Current A draft");
});


it("keeps a dirty draft unconfirmed when same-file Undo succeeds before its held Save receipt", async () => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  await type("Submitted draft before Undo");
  const saved = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(saved.promise);
  await click("Save");
  await click("Undo");
  expect(editor().value).toBe("Submitted draft before Undo");
  await act(async () => saved.resolve({ ok: true, doc: doc("MEMORY.md", "Submitted draft before Undo", "obsolete-save-hash"), overview: overview() }));
  await tick();
  expect(editor().value).toBe("Submitted draft before Undo");
  expect(button("Save").disabled).toBe(false);
  await click("Save");
  // Undo deliberately leaves dirty drafts on their original optimistic hash;
  // the server's existing conflict contract decides the next write.
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "MEMORY.md", "Submitted draft before Undo", "hash:MEMORY.md");
});

it.each(["revert", "journal"] as const)("keeps newer typing dirty while Undo's %s response is pending", async phase => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  const reverted = deferred<MemoryDoc & { overview: MemoryOverview }>();
  const journal = deferred<MemoryJournalRow[]>();
  if (phase === "revert") fixture.revert.mockReturnValueOnce(reverted.promise);
  else fixture.journal.mockReturnValueOnce(journal.promise);
  await click("Undo");
  await type("Words typed during Undo");
  await act(async () => {
    if (phase === "revert") reverted.resolve({ ...doc("MEMORY.md", "Restored on disk", "undo-hash"), overview: overview() });
    else journal.resolve([row]);
  });
  await tick();
  expect(editor().value).toBe("Words typed during Undo");
  expect(button("Save").disabled).toBe(false);
  await click("Save");
  // Typing before Undo completes keeps its optimistic conflict hash. Once
  // the clean document was restored, later typing starts from that revision.
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "MEMORY.md", "Words typed during Undo", phase === "revert" ? "hash:MEMORY.md" : "revert-hash");
});

it.each(["revert", "journal"] as const)("does not reopen the undone file after navigation during its %s response", async phase => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  const reverted = deferred<MemoryDoc & { overview: MemoryOverview }>();
  const journal = deferred<MemoryJournalRow[]>();
  if (phase === "revert") fixture.revert.mockReturnValueOnce(reverted.promise);
  else fixture.journal.mockReturnValueOnce(journal.promise);
  await click("Undo");
  await click("b.md");
  await type("Keep the selected B draft");
  await act(async () => {
    if (phase === "revert") reverted.resolve({ ...doc("MEMORY.md", "Old Undo response", "undo-hash"), overview: overview() });
    else journal.resolve([row]);
  });
  await tick();
  expect(editor().getAttribute("aria-label")).toBe("Memory file memory/b.md");
  expect(editor().value).toBe("Keep the selected B draft");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "memory/b.md", "Keep the selected B draft", "hash:memory/b.md");
});

it("does not rewind a later same-path read after navigating away while Undo is held", async () => {
  fixture.journal.mockResolvedValue([{ ...row, path: "memory/a.md" }]);
  await render();
  await click("a.md");
  const reverted = deferred<MemoryDoc & { overview: MemoryOverview }>();
  fixture.revert.mockReturnValueOnce(reverted.promise);
  await click("Undo");
  await click("b.md");
  fixture.doc.mockResolvedValueOnce(doc("memory/a.md", "Later loaded A", "later-a-hash"));
  await click("a.md");
  await act(async () => reverted.resolve({ ...doc("memory/a.md", "Old Undo A", "old-undo-hash"), overview: overview() }));
  await tick();
  expect(editor().value).toBe("Later loaded A");
  await type("Draft on later loaded A");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "memory/a.md", "Draft on later loaded A", "later-a-hash");
});

it("does not rewind a newer saved revision when an older Undo receipt arrives", async () => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  const reverted = deferred<MemoryDoc & { overview: MemoryOverview }>();
  fixture.revert.mockReturnValueOnce(reverted.promise);
  await click("Undo");
  await type("Newly saved after Undo started");
  await click("Save");
  await act(async () => reverted.resolve({ ...doc("MEMORY.md", "Older Undo receipt", "older-undo-hash"), overview: overview() }));
  await tick();
  expect(editor().value).toBe("Newly saved after Undo started");
  await type("Next draft on saved revision");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "MEMORY.md", "Next draft on saved revision", "saved-hash");
});

it("lets navigation begun after Undo finish without cancelling its held read", async () => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  const reverted = deferred<MemoryDoc & { overview: MemoryOverview }>();
  const selected = deferred<MemoryDoc>();
  fixture.revert.mockReturnValueOnce(reverted.promise);
  await click("Undo");
  fixture.doc.mockReturnValueOnce(selected.promise);
  await click("b.md");
  await act(async () => reverted.resolve({ ...doc("MEMORY.md", "Undo index", "undo-hash"), overview: overview() }));
  await tick();
  await act(async () => selected.resolve(doc("memory/b.md", "Later selected B", "later-b-hash")));
  await tick();
  expect(editor().getAttribute("aria-label")).toBe("Memory file memory/b.md");
  expect(editor().value).toBe("Later selected B");
});

it("retains newer activation metadata and journal when an older Undo journal settles", async () => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  const journal = deferred<MemoryJournalRow[]>();
  fixture.journal.mockReturnValueOnce(journal.promise);
  await click("Undo");
  await render(false);
  fixture.overview.mockResolvedValueOnce(overview("/synthetic/new-activation"));
  fixture.journal.mockResolvedValueOnce([{ ...row, id: "new-current", path: "memory/b.md" }]);
  await render();
  await act(async () => journal.resolve([]));
  await tick();
  expect(container.textContent).toContain("/synthetic/new-activation");
  expect(container.textContent).toContain("the b topic");
  expect(button("Undo").disabled).toBe(false);
});

it.each(["current", "later selection"] as const)("shows an Undo failure only for its %s editor", async intent => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  const reverted = deferred<MemoryDoc & { overview: MemoryOverview }>();
  fixture.revert.mockReturnValueOnce(reverted.promise);
  await click("Undo");
  if (intent === "later selection") await click("b.md");
  await act(async () => reverted.reject(new Error("Synthetic Undo refused")));
  await tick();
  if (intent === "current") expect(container.textContent).toContain("Synthetic Undo refused");
  else expect(container.textContent).not.toContain("Synthetic Undo refused");
});

it.each(["current", "new activation"] as const)("shows a failed Undo journal only for its %s metadata", async intent => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  const journal = deferred<MemoryJournalRow[]>();
  fixture.journal.mockReturnValueOnce(journal.promise);
  await click("Undo");
  await type("Draft typed after Undo");
  if (intent === "new activation") {
    await render(false);
    fixture.overview.mockResolvedValueOnce(overview("/synthetic/current-reactivation"));
    fixture.journal.mockResolvedValueOnce([{ ...row, id: "new-current", path: "memory/b.md" }]);
    await render();
  }
  await act(async () => journal.reject(new Error("Synthetic old Undo journal failed")));
  await tick();
  expect(editor().value).toBe("Draft typed after Undo");
  expect(button("Save").disabled).toBe(false);
  if (intent === "current") expect(container.textContent).toContain("Synthetic old Undo journal failed");
  else {
    expect(container.textContent).not.toContain("Synthetic old Undo journal failed");
    expect(container.textContent).toContain("/synthetic/current-reactivation");
    expect(container.textContent).toContain("the b topic");
  }
});

it("accepts a newer same-path Save after an older Undo receipt finishes", async () => {
  fixture.journal.mockResolvedValue([{ ...row, path: "memory/a.md" }]);
  await render();
  await click("a.md");
  const reverted = deferred<MemoryDoc & { overview: MemoryOverview }>();
  const saved = deferred<SaveResult>();
  fixture.revert.mockReturnValueOnce(reverted.promise);
  await click("Undo");
  await click("b.md");
  // This newer read already sees the restored file on disk; only Undo's
  // earlier transport receipt is delayed. The subsequent Save owns this read.
  fixture.doc.mockResolvedValueOnce(doc("memory/a.md", "Restored A", "restored-a"));
  await click("a.md");
  await type("Saved after reread");
  fixture.save.mockReturnValueOnce(saved.promise);
  await click("Save");
  await act(async () => reverted.resolve({ ...doc("memory/a.md", "Restored A", "restored-a"), overview: overview() }));
  await tick();
  await act(async () => saved.resolve({ ok: true, doc: doc("memory/a.md", "Saved after reread", "newer-save-hash"), overview: overview() }));
  await tick();
  expect(editor().value).toBe("Saved after reread");
  expect(button("Save").disabled).toBe(true);
  await type("Next edit");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "memory/a.md", "Next edit", "newer-save-hash");
});

it("retains a pending Save based on a newer successful saved revision during old Undo", async () => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  const reverted = deferred<MemoryDoc & { overview: MemoryOverview }>();
  fixture.revert.mockReturnValueOnce(reverted.promise);
  await click("Undo");
  await type("First newer saved revision");
  await click("Save");
  const saved = deferred<SaveResult>();
  fixture.save.mockReturnValueOnce(saved.promise);
  await type("Second newer saved revision");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "MEMORY.md", "Second newer saved revision", "saved-hash");
  await act(async () => reverted.resolve({ ...doc("MEMORY.md", "Old Undo text", "old-undo-hash"), overview: overview() }));
  await tick();
  await act(async () => saved.resolve({ ok: true, doc: doc("MEMORY.md", "Second newer saved revision", "second-save-hash"), overview: overview() }));
  await tick();
  expect(editor().value).toBe("Second newer saved revision");
  expect(button("Save").disabled).toBe(true);
  await type("Next current edit");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "MEMORY.md", "Next current edit", "second-save-hash");
});

// Overlapping mutations must refresh from current server metadata. A mutation
// response overview is a historical snapshot; it cannot describe a later write.
it.each(["Save", "Undo"] as const)("refreshes the visible journal and overview when held %s completes after the other mutation", async heldKind => {
  const topicRow = { ...row, id: "topic-change", path: "memory/b.md" };
  const savedRow = { ...row, id: "saved-index", added: 2 };
  const undoRow = { ...topicRow, id: "undone-topic", via: "revert" as const, added: 0, removed: 3 };
  let serverRows = [topicRow];
  let serverOverview = overview("/synthetic/before-overlap");
  fixture.journal.mockImplementation(async () => [...serverRows]);
  fixture.overview.mockImplementation(async () => serverOverview);
  await render();
  const saved = deferred<SaveResult>();
  const undone = deferred<MemoryDoc & { overview: MemoryOverview }>();
  fixture.save.mockReturnValueOnce(saved.promise);
  fixture.revert.mockReturnValueOnce(undone.promise);
  await type("Current index edit");
  await click(heldKind);
  await click(heldKind === "Save" ? "Undo" : "Save");
  if (heldKind === "Save") {
    serverRows = [topicRow, undoRow];
    serverOverview = overview("/synthetic/after-first-undo");
    await act(async () => undone.resolve({ ...doc("memory/b.md", "Restored topic", "undone-topic-hash"), overview: overview("/synthetic/old-undo-response") }));
  } else {
    serverRows = [topicRow, savedRow];
    serverOverview = overview("/synthetic/after-first-save");
    await act(async () => saved.resolve({ ok: true, doc: doc("MEMORY.md", "Current index edit", "current-save-hash"), overview: overview("/synthetic/old-save-response") }));
  }
  await tick();
  serverRows = [topicRow, undoRow, savedRow];
  serverOverview = overview("/synthetic/after-both-mutations");
  await act(async () => {
    if (heldKind === "Save") saved.resolve({ ok: true, doc: doc("MEMORY.md", "Current index edit", "current-save-hash"), overview: overview("/synthetic/stale-held-response") });
    else undone.resolve({ ...doc("memory/b.md", "Restored topic", "undone-topic-hash"), overview: overview("/synthetic/stale-held-response") });
  });
  await tick();
  expect(container.textContent).toContain("You added 2 lines to MEMORY.md");
  expect(container.textContent).toContain("You removed 3 lines from the b topic");
  expect([...container.querySelectorAll("button")].filter(el => el.textContent?.trim() === "Undo")).toHaveLength(3);
  expect(container.textContent).toContain("/synthetic/after-both-mutations");
  expect(container.textContent).not.toContain("/synthetic/stale-held-response");
  expect(editor().value).toBe("Current index edit");
  expect(button("Save").disabled).toBe(true);
  await type("Next current index edit");
  await click("Save");
  expect(fixture.save).toHaveBeenLastCalledWith(bot.id, "MEMORY.md", "Next current index edit", "current-save-hash");
});

it.each(["resolve", "reject"] as const)("ignores an obsolete Save metadata %s after a later Undo refreshed current metadata", async completion => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  const oldOverview = deferred<MemoryOverview>();
  const oldJournal = deferred<MemoryJournalRow[]>();
  fixture.overview.mockReturnValueOnce(oldOverview.promise);
  fixture.journal.mockReturnValueOnce(oldJournal.promise);
  await type("Index saved before later Undo");
  await click("Save");
  const latestRow = { ...row, id: "latest-undo", via: "revert" as const, added: 0, removed: 4 };
  fixture.overview.mockResolvedValueOnce(overview("/synthetic/latest-mutation"));
  fixture.journal.mockResolvedValueOnce([latestRow]);
  await click("Undo");
  await act(async () => {
    oldOverview.resolve(overview("/synthetic/obsolete-save-metadata"));
    if (completion === "resolve") oldJournal.resolve([{ ...row, id: "obsolete-row", added: 17 }]);
    else oldJournal.reject(new Error("Obsolete Save metadata failed"));
  });
  await tick();
  expect(container.textContent).toContain("/synthetic/latest-mutation");
  expect(container.textContent).toContain("You removed 4 lines from MEMORY.md");
  expect(container.textContent).not.toContain("/synthetic/obsolete-save-metadata");
  expect(container.textContent).not.toContain("Obsolete Save metadata failed");
  expect(container.textContent).not.toContain("You added 17 lines");
  expect(editor().value).toBe("Reverted text");
});

it.each(["Save", "Undo"] as const)("does not start late %s metadata over a newer active view", async kind => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  const saved = deferred<SaveResult>();
  const undone = deferred<MemoryDoc & { overview: MemoryOverview }>();
  fixture.save.mockReturnValueOnce(saved.promise);
  fixture.revert.mockReturnValueOnce(undone.promise);
  await type("Draft across activation");
  await click(kind);
  await render(false);
  fixture.overview.mockResolvedValueOnce(overview("/synthetic/new-view"));
  fixture.journal.mockResolvedValueOnce([{ ...row, id: "new-view-row", added: 8 }]);
  await render();
  const reads = fixture.overview.mock.calls.length;
  await act(async () => {
    if (kind === "Save") saved.resolve({ ok: true, doc: doc("MEMORY.md", "Draft across activation", "saved-hash"), overview: overview("/synthetic/old-view-response") });
    else undone.resolve({ ...doc("MEMORY.md", "Old Undo", "old-undo-hash"), overview: overview("/synthetic/old-view-response") });
  });
  await tick();
  expect(fixture.overview).toHaveBeenCalledTimes(reads);
  expect(container.textContent).toContain("/synthetic/new-view");
  expect(container.textContent).toContain("You added 8 lines to MEMORY.md");
  expect(container.textContent).not.toContain("/synthetic/old-view-response");
  expect(editor().value).toBe("Draft across activation");
});

it.each(["overview", "journal"] as const)("reports a current post-Save %s read failure and recovers on the next successful mutation", async phase => {
  fixture.journal.mockResolvedValue([row]);
  await render();
  fixture[phase].mockRejectedValueOnce(new Error("Current post-Save metadata failed"));
  await type("Saved despite metadata failure");
  await click("Save");
  expect(editor().value).toBe("Saved despite metadata failure");
  expect(button("Save").disabled).toBe(true);
  expect(container.textContent).toContain("Current post-Save metadata failed");
  fixture.overview.mockResolvedValueOnce(overview("/synthetic/recovered-metadata"));
  fixture.journal.mockResolvedValueOnce([{ ...row, id: "recovered-row", added: 9 }]);
  await type("Next successful edit");
  await click("Save");
  expect(container.textContent).not.toContain("Current post-Save metadata failed");
  expect(container.textContent).toContain("/synthetic/recovered-metadata");
  expect(container.textContent).toContain("You added 9 lines to MEMORY.md");
});

it("clears an obsolete metadata failure that arrives while the later Undo mutation is pending", async () => {
  const topicRow = { ...row, id: "topic-change", path: "memory/b.md" };
  fixture.journal.mockResolvedValue([topicRow]);
  await render();
  const oldJournal = deferred<MemoryJournalRow[]>();
  fixture.journal.mockReturnValueOnce(oldJournal.promise);
  await type("Save before held Undo");
  await click("Save");
  const undone = deferred<MemoryDoc & { overview: MemoryOverview }>();
  fixture.revert.mockReturnValueOnce(undone.promise);
  await click("Undo");
  await act(async () => oldJournal.reject(new Error("Superseded metadata error")));
  await tick();
  expect(container.textContent).toContain("Superseded metadata error");
  fixture.overview.mockResolvedValueOnce(overview("/synthetic/current-after-recovery"));
  fixture.journal.mockResolvedValueOnce([{ ...topicRow, id: "latest-undo", via: "revert", added: 0, removed: 6 }]);
  await act(async () => undone.resolve({ ...doc("memory/b.md", "Restored topic", "restored-topic"), overview: overview("/synthetic/old-receipt") }));
  await tick();
  expect(container.textContent).toContain("/synthetic/current-after-recovery");
  expect(container.textContent).toContain("You removed 6 lines from the b topic");
  expect(container.textContent).not.toContain("Superseded metadata error");
  expect(editor().value).toBe("Save before held Undo");
});

it("keeps a later current file-read error even when it matches the old metadata failure text", async () => {
  const topicRow = { ...row, id: "topic-change", path: "memory/b.md" };
  fixture.journal.mockResolvedValue([topicRow]);
  await render();
  fixture.journal.mockRejectedValueOnce(new Error("Shared failure text"));
  await type("Saved index");
  await click("Save");
  expect(container.textContent).toContain("Shared failure text");
  const latest = deferred<MemoryOverview>();
  fixture.overview.mockReturnValueOnce(latest.promise);
  fixture.journal.mockResolvedValueOnce([{ ...topicRow, id: "latest-undo", via: "revert", added: 0, removed: 7 }]);
  await click("Undo");
  fixture.doc.mockRejectedValueOnce(new Error("Shared failure text"));
  await click("b.md");
  expect(fixture.doc).toHaveBeenLastCalledWith(bot.id, "memory/b.md");
  expect(container.textContent).toContain("Shared failure text");
  await act(async () => latest.resolve(overview("/synthetic/fresh-metadata-with-current-file-error")));
  await tick();
  expect(container.textContent).toContain("/synthetic/fresh-metadata-with-current-file-error");
  expect(container.textContent).toContain("You removed 7 lines from the b topic");
  expect(container.textContent).toContain("Shared failure text");
  expect(editor().value).toBe("Saved index");
});
