// @vitest-environment happy-dom
// GrokOff: a real ChatView/branch/window/Markdown/report reader, with only
// in-memory file and desktop transports. No server, provider or native calls.
// GrokOff modification (2026-10-10): also exercise real room row eviction.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Action, AppState, Bot, Group, InstanceInfo, Message } from "@/state/store";

// These are the existing ChatView.rows fixture seams. Do not replace the
// transcript, viewport, Markdown, report reader, store reducer or PDF hook.
vi.mock("@/components/DesktopCapabilities", async (original) => ({
  ...await original<typeof import("@/components/DesktopCapabilities")>(),
  useDesktopCapabilities: () => ({ capabilities: { dictation: { available: false }, host: { packaged: true, platform: "other" }, localComputer: { available: false } }, ready: true }),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/cloud-guest", () => ({ useCanWriteIn: () => true }));
vi.mock("@/components/ModelPicker", () => ({ ModelPicker: () => null }));

const { ChatView } = await import("@/components/ChatView");
const { GroupView } = await import("@/components/GroupView");
const { BotEditorStore, initialState, reducer } = await import("@/state/store");
const { setLocale } = await import("@/lib/i18n");

type PdfRequest = Parameters<NonNullable<NonNullable<Window["ogb"]>["exportReportPdf"]>>[0];
const THREAD = "report-continuity-thread";
const ROOM_THREAD = "room-report-continuity-thread";
const PATH = "/owned/Continuity.md";
const NEXT_PATH = "/owned/Replaced.md";
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
};
const response = (text = "# Current report\n\nOwned report contents") => new Response(text, { headers: { "content-type": "text/markdown" } });
const textMessage = (index: number, parentId?: string): Message => ({
  id: `m${index}`, parentId, role: index === 0 || index % 2 === 0 ? "bot" : "user", kind: "text",
  text: index === 0 ? `[Read findings](${PATH})` : `Turn ${index}`,
  at: 1_790_000_000_000 + index * 1_000, turnTerminal: true,
});
const transcript = (): Message[] => Array.from({ length: 120 }, (_, index) => textMessage(index, index ? `m${index - 1}` : undefined));
const profile = (messages: Message[], threadId = THREAD): Bot => ({
  id: "report-bot", threadId, name: "Report bot", title: "", description: "", color: "green",
  notifications: true, unread: false, busy: false, activity: "idle", messages,
  activeLeafId: messages.at(-1)?.id, modelSelection: { instanceId: "test", model: "m" },
  tasks: [{ threadId, title: "Report thread", createdAt: 1, busy: false, activity: "idle", modelSelection: { instanceId: "test", model: "m" }, approvalMode: "ask" }],
});
let root: Root, container: HTMLDivElement, state: AppState;
let originalBridge: Window["ogb"];
let readMode: "held" | "success";
let reads: Array<{ threadId: string; messageId: string; path: string; signal: AbortSignal; pending: ReturnType<typeof deferred<Response>> }>;
let pdfJobs: Array<{ request: PdfRequest; pending: ReturnType<typeof deferred<"saved" | "cancelled">> }>;
let unknownRequests: string[];
const cancelPdf = vi.fn<(id: string) => Promise<boolean>>(async () => true);
const tick = async () => { await act(async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); }); };
const button = (label: string, scope: ParentNode = document) => {
  const matches = [...scope.querySelectorAll<HTMLButtonElement>("button")].filter((node) => node.getAttribute("aria-label") === label || node.textContent?.trim() === label);
  expect(matches, `one real button: ${label}`).toHaveLength(1);
  return matches[0]!;
};
const dialog = () => document.querySelector<HTMLDialogElement>("dialog");
async function draw() {
  const value = { state, dispatch: vi.fn(), flushBotPatches: async () => null, refreshInstances: async () => {}, refreshModels: async () => {}, refreshSignInModels: async () => {}, signInModelDiscovery: {} };
  const group = state.groups.find((candidate) => candidate.id === state.selectedId);
  const view = group ? createElement(GroupView, { group }) : createElement(ChatView, { bot: state.bots[0]! });
  await act(async () => root.render(createElement(BotEditorStore, { value, children: view })));
  await tick();
}
async function apply(action: Action) {
  state = reducer(state, action);
  await draw();
}
async function open(entry: "markdown" | "attachment" = "markdown") {
  // A bot link also appears in the derived file gallery. Exercise the real
  // Markdown entry specifically, without replacing either production path.
  const source = container.querySelector(entry === "markdown" ? '[data-mid="m0"] .chat-md' : '[data-mid="m0"]');
  expect(source).not.toBeNull();
  act(() => button("Open report: Continuity.md", source!).click());
  await tick();
  expect(dialog()?.open).toBe(true);
  expect(reads).toHaveLength(1);
  const threadId = state.groups.find((group) => group.id === state.selectedId)?.threadId ?? THREAD;
  expect(reads[0]).toMatchObject({ threadId, messageId: "m0", path: PATH });
}
async function exportHeld(entry: "markdown" | "attachment" = "markdown") {
  readMode = "success";
  await open(entry);
  expect(dialog()?.querySelector("h1")?.textContent).toBe("Current report");
  act(() => button("Save PDF").click());
  await tick();
  expect(pdfJobs).toHaveLength(1);
  expect(dialog()?.textContent).toContain("Creating PDF");
  expect(JSON.stringify(pdfJobs[0]!.request.content)).toContain("Owned report contents");
}
async function advanceWindow() {
  const before = state.bots[0]!;
  expect(before.messages).toHaveLength(120);
  expect(container.querySelectorAll("[data-mid]")).toHaveLength(120);
  expect(container.querySelector('[data-mid="m0"]')).not.toBeNull();
  await apply({ type: "messageAdded", threadId: THREAD, message: textMessage(120, before.activeLeafId ?? undefined) });
  expect(state.bots[0]!.messages).toHaveLength(121);
  expect(state.bots[0]!.activeLeafId).toBe("m120");
  // This asserts real eviction, rather than manually unmounting the reader.
  expect(container.querySelector('[data-mid="m0"]')).toBeNull();
  expect(container.querySelector('[data-mid="m120"]')).not.toBeNull();
  expect(container.querySelectorAll("[data-mid]")).toHaveLength(120);
}
async function selectRoom() {
  const member = state.bots[0]!;
  const group: Group = { id: "report-room", threadId: ROOM_THREAD, name: "Report room", memberIds: [member.id],
    defaultResponder: { kind: "everyone" }, bulletin: "", unread: false, createdAt: 1, setupCompletedAt: 1,
    messages: transcript().map((message) => message.role === "bot"
      ? { ...message, from: { botId: member.id, name: member.name, color: member.color } } : message),
  };
  state = { ...state, selectedId: group.id, groups: [group],
    config: { ...state.config!, rooms: { turnTimeoutMinutes: 5 } } as AppState["config"],
  };
  expect(group.threadId).not.toBe(member.threadId);
  await draw();
}
async function advanceRoomWindow() {
  expect(state.groups[0]!.messages).toHaveLength(120);
  expect(container.querySelectorAll("[data-mid]")).toHaveLength(120);
  expect(container.querySelector('[data-mid="m0"]')).not.toBeNull();
  const member = state.bots[0]!;
  await apply({ type: "messageAdded", threadId: ROOM_THREAD,
    message: { ...textMessage(120, "m119"), from: { botId: member.id, name: member.name, color: member.color } },
  });
  expect(state.groups[0]!.messages).toHaveLength(121);
  expect(state.bots[0]!.messages).toHaveLength(120);
  expect(container.querySelector('[data-mid="m0"]')).toBeNull();
  expect(container.querySelector('[data-mid="m120"]')).not.toBeNull();
  expect(container.querySelectorAll("[data-mid]")).toHaveLength(120);
}
async function invalidate(kind: "conversation" | "source" | "grant" | "branch") {
  if (kind === "conversation") {
    const next = textMessage(0);
    await apply({ type: "taskSwitched", bot: profile([next], "other-report-thread") });
    expect(state.bots[0]!.threadId).toBe("other-report-thread");
  } else if (kind === "branch") {
    const current = state.bots[0]!;
    const fork = { ...textMessage(121), id: "other-branch", role: "user" as const, text: "Another branch" };
    await apply({ type: "taskSwitched", bot: { ...current, messages: [...current.messages, fork], activeLeafId: fork.id } });
    expect(state.bots[0]!.messages.some((message) => message.id === "m0")).toBe(true);
    expect(container.querySelector('[data-mid="m0"]')).toBeNull();
  } else {
    const first = state.bots[0]!.messages[0]!;
    await apply({ type: "messagePatched", threadId: THREAD, message: { ...first, text: kind === "source" ? "The stored source no longer offers this file." : `[Replacement](${NEXT_PATH})` } });
    expect(container.querySelector('[data-mid="m0"]')).not.toBeNull();
  }
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setLocale("en");
  reads = []; pdfJobs = []; unknownRequests = []; readMode = "held"; cancelPdf.mockClear();
  originalBridge = window.ogb;
  window.ogb = {
    exportReportPdf: async (request: PdfRequest) => { const pending = deferred<"saved" | "cancelled">(); pdfJobs.push({ request, pending }); return pending.promise; },
    cancelReportPdf: cancelPdf,
  } as unknown as Window["ogb"];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    // The real chat also reads the local session kind once. This explicitly
    // sealed response cannot reach a server or discover an account.
    if (url === "/api/auth/session" && (init?.method ?? "GET") === "GET") return Response.json({ kind: "loopback" });
    const match = /^\/api\/threads\/(report-continuity-thread|other-report-thread|room-report-continuity-thread)\/messages\/(m0)\/file$/.exec(url);
    const body = JSON.parse(String(init?.body ?? "null")) as { path?: string } | null;
    if (!match || init?.method !== "POST" || ![PATH, NEXT_PATH].includes(body?.path ?? "") || !(init?.signal instanceof AbortSignal)) {
      unknownRequests.push(url);
      throw new Error(`Unexpected in-memory request: ${url}`);
    }
    const pending = deferred<Response>();
    reads.push({ threadId: match[1]!, messageId: match[2]!, path: body!.path!, signal: init.signal, pending });
    return readMode === "held" ? pending.promise : response();
  }));
  state = { ...initialState, connected: true, selectedId: "report-bot", bots: [profile(transcript())],
    instances: [{ instanceId: "test", driverKind: "codex", displayName: "Test", snapshot: { state: "available" } } as InstanceInfo],
    config: { features: { showToolCalls: true } } as AppState["config"],
  };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await draw();
});
afterEach(async () => {
  try {
    act(() => root.unmount());
    container.remove();
    // Resolve deliberately non-cooperative transports after unmount so late
    // responses are exercised without leaving pending fixture work behind.
    for (const read of reads) read.pending.resolve(response("# Obsolete report"));
    for (const job of pdfJobs) job.pending.resolve("saved");
    await tick();
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.querySelector("[data-mid]")).toBeNull();
    expect(unknownRequests).toEqual([]);
  } finally {
    window.ogb = originalBridge;
    vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
  }
});

it("keeps an authorized reader and held read alive when its row leaves the real 120-message window", async () => {
  await open();
  await advanceWindow();
  expect(reads[0]!.signal.aborted).toBe(false);
  expect(dialog()?.open).toBe(true);
  reads[0]!.pending.resolve(response()); await tick();
  expect(dialog()?.querySelector("h1")?.textContent).toBe("Current report");
  expect(reads).toHaveLength(1);
});

it("keeps the exact pending PDF alive across row eviction and shows its real result", async () => {
  await exportHeld();
  await advanceWindow();
  expect(cancelPdf).not.toHaveBeenCalled();
  expect(dialog()?.open).toBe(true);
  pdfJobs[0]!.pending.resolve("saved"); await tick();
  expect(dialog()?.textContent).toContain("PDF saved.");
  expect(pdfJobs).toHaveLength(1);
  expect(reads).toHaveLength(1);
});

it("keeps a room's exact reader and held read alive across real 120-message row eviction", async () => {
  await selectRoom();
  await open();
  const currentDialog = dialog();
  await advanceRoomWindow();
  expect(reads[0]!.signal.aborted).toBe(false);
  expect(dialog()).toBe(currentDialog);
  reads[0]!.pending.resolve(response()); await tick();
  expect(dialog()?.querySelector("h1")?.textContent).toBe("Current report");
  expect(reads).toHaveLength(1);
});

it("keeps a room's exact pending PDF alive across real row eviction and completes it", async () => {
  await selectRoom();
  await exportHeld();
  const currentDialog = dialog();
  await advanceRoomWindow();
  expect(cancelPdf).not.toHaveBeenCalled();
  expect(dialog()).toBe(currentDialog);
  pdfJobs[0]!.pending.resolve("saved"); await tick();
  expect(dialog()?.textContent).toContain("PDF saved.");
  expect(pdfJobs).toHaveLength(1);
  expect(reads).toHaveLength(1);
});

it.each(["conversation", "source", "grant", "branch"] as const)("still closes and aborts a held reader after %s invalidation", async (kind) => {
  await open();
  await invalidate(kind);
  expect(dialog()).toBeNull();
  expect(reads[0]!.signal.aborted).toBe(true);
  reads[0]!.pending.resolve(response("# Obsolete report")); await tick();
  expect(dialog()).toBeNull();
  expect(document.body.textContent).not.toContain("Obsolete report");
  expect(reads).toHaveLength(1);
});

it.each(["conversation", "source", "grant", "branch"] as const)("still cancels only the exact pending PDF after %s invalidation", async (kind) => {
  await exportHeld();
  const id = pdfJobs[0]!.request.id;
  await invalidate(kind);
  expect(dialog()).toBeNull();
  expect(cancelPdf).toHaveBeenCalledExactlyOnceWith(id);
  pdfJobs[0]!.pending.resolve("saved"); await tick();
  expect(dialog()).toBeNull();
  expect(document.body.textContent).not.toContain("PDF saved.");
  expect(pdfJobs).toHaveLength(1);
});

it("retains the exact reader and read through equal-authority object, timestamp and reaction refreshes", async () => {
  await open();
  const currentDialog = dialog();
  const first = state.bots[0]!.messages[0]!;
  await apply({ type: "messagePatched", threadId: THREAD, message: { ...first, at: first.at + 10, reactions: [{ emoji: "👍", by: "fixture" }], attachments: [] } });
  expect(dialog()).toBe(currentDialog);
  expect(reads[0]!.signal.aborted).toBe(false);
  expect(reads).toHaveLength(1);
});

async function attachmentOnly() {
  const first = state.bots[0]!.messages[0]!;
  await apply({ type: "messagePatched", threadId: THREAD, message: { ...first, text: "", attachments: [{ kind: "file", path: PATH, name: "Continuity.md", mime: "text/markdown" }] } });
}

it("keeps an attachment-only reader through eviction but closes when its stored attachment is removed", async () => {
  await attachmentOnly();
  await open("attachment");
  await advanceWindow();
  expect(dialog()?.open).toBe(true);
  expect(reads[0]!.signal.aborted).toBe(false);
  const first = state.bots[0]!.messages[0]!;
  await apply({ type: "messagePatched", threadId: THREAD, message: { ...first, attachments: [] } });
  expect(dialog()).toBeNull();
  expect(reads[0]!.signal.aborted).toBe(true);
});

it("keeps an attachment-only PDF through eviction but cancels when its stored name changes", async () => {
  await attachmentOnly();
  await exportHeld("attachment");
  await advanceWindow();
  expect(cancelPdf).not.toHaveBeenCalled();
  const first = state.bots[0]!.messages[0]!;
  await apply({ type: "messagePatched", threadId: THREAD, message: { ...first, attachments: [{ kind: "file", path: PATH, name: "Renamed.md", mime: "text/markdown" }] } });
  expect(dialog()).toBeNull();
  expect(cancelPdf).toHaveBeenCalledExactlyOnceWith(pdfJobs[0]!.request.id);
});
