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
