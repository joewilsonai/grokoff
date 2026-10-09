// @vitest-environment happy-dom
// GrokOff: actual memory editor lifecycle with deferred in-memory reads.
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
