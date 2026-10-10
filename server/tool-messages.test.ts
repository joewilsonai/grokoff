// Real disposable Store receipts and the provider item map, with no provider calls.
import { rmSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { DATA_DIR } from "./config.ts";
import { Store } from "./store.ts";
import { completeToolMessage, interruptToolMessages } from "./tool-messages.ts";

const selection = () => ({ instanceId: "claude", model: "claude-sonnet-5" });
beforeEach(() => rmSync(DATA_DIR, { recursive: true, force: true }));
const fixture = () => {
  const store = new Store(selection);
  const bot = store.createBot({ name: "Owned research fixture" }, { seedMessages: false });
  const pending = new Map<string, string>();
  const append = (threadId: string, turnId: string, itemId: string, ok?: boolean) => {
    const row = store.appendMessage(threadId, { role: "bot", kind: "activity", turnId,
      tool: { name: "browser.get_text", itemId, input: "main", spoken: "Reading", ...(ok === undefined ? {} : { ok, output: "Recorded result" }) } });
    if (ok === undefined) pending.set(`${threadId}:${itemId}`, row.id);
    return row;
  };
  return { store, bot, pending, append };
};

describe("provider tool receipt ownership", () => {
  it("stops only unfinished receipts of the exact turn and persists their unknown outcome", () => {
    const { store, bot, pending, append } = fixture();
    const row = append(bot.threadId, "old", "pending");
    const complete = append(bot.threadId, "old", "complete", true);
    const failed = append(bot.threadId, "old", "failed", false);
    const next = append(bot.threadId, "next", "next");
    const otherThread = store.createTask(bot.id, "Other owned thread", false)!.threadId;
    const sibling = append(otherThread, "old", "sibling");
    const otherBot = store.createBot({ name: "Other owned bot" }, { seedMessages: false });
    const unrelated = append(otherBot.threadId, "old", "unrelated");
    const chip = store.appendMessage(bot.threadId, { role: "bot", kind: "activity", turnId: "old", tool: { name: "Waiting on a teammate" } });
    const untouched = structuredClone([complete, failed, next, sibling, unrelated, chip]);
    interruptToolMessages(store, pending, bot.threadId, "old");
    const stopped = store.messagesFor(bot.threadId).find(message => message.id === row.id)!;
    expect(stopped.tool).toEqual({ ...row.tool, interrupted: true });
    expect(stopped.tool).not.toHaveProperty("ok");
    expect(stopped.tool).not.toHaveProperty("output");
    expect(pending.has(`${bot.threadId}:pending`)).toBe(false);
    expect([complete, failed, next, sibling, unrelated, chip]).toEqual(untouched);
    interruptToolMessages(store, pending, bot.threadId, "old");
    expect(store.messagesFor(bot.threadId).find(message => message.id === row.id)).toEqual(stopped);
    const restored = new Store(selection);
    expect(restored.messagesFor(bot.threadId).find(message => message.id === row.id)).toEqual(stopped);
    expect(restored.messagesFor(otherThread)).toEqual([sibling]);
  });

  it("does not let a late stopped turn patch or delete a replacement receipt with the same item ID", () => {
    const { store, bot, pending, append } = fixture();
    const old = append(bot.threadId, "old", "reused");
    const replacement = append(bot.threadId, "new", "reused");
    interruptToolMessages(store, pending, bot.threadId, "old");
    expect(pending.get(`${bot.threadId}:reused`)).toBe(replacement.id);
    expect(completeToolMessage(store, pending, bot.threadId, "reused", "old", true, "Late old result")).toBeNull();
    expect(pending.get(`${bot.threadId}:reused`)).toBe(replacement.id);
    expect(completeToolMessage(store, pending, bot.threadId, "reused", undefined, true, "Unscoped result")).toBeNull();
    expect(pending.get(`${bot.threadId}:reused`)).toBe(replacement.id);
    expect(store.messagesFor(bot.threadId).find(row => row.id === replacement.id)?.tool).not.toHaveProperty("ok");
    expect(completeToolMessage(store, pending, bot.threadId, "reused", "new", false, "Actual new refusal")).toBe("browser.get_text");
    expect(pending.has(`${bot.threadId}:reused`)).toBe(false);
    expect(store.messagesFor(bot.threadId).find(row => row.id === replacement.id)?.tool).toMatchObject({ ok: false, output: "Actual new refusal", input: "main", spoken: "Reading" });
    expect(store.messagesFor(bot.threadId).find(row => row.id === old.id)?.tool).toMatchObject({ interrupted: true });
  });

  it("rejects a stopped receipt even if an obsolete map entry survives", () => {
    const { store, bot, pending, append } = fixture();
    const old = append(bot.threadId, "old", "item");
    interruptToolMessages(store, pending, bot.threadId, "old");
    pending.set(`${bot.threadId}:item`, old.id);
    expect(completeToolMessage(store, pending, bot.threadId, "item", "old", true, "Late result")).toBeNull();
    expect(store.messagesFor(bot.threadId).find(row => row.id === old.id)?.tool).not.toHaveProperty("output");
  });

  it("keeps legacy unscoped receipt completion readable and does not guess which turn stopped", () => {
    const { store, bot, pending } = fixture();
    const row = store.appendMessage(bot.threadId, { role: "bot", kind: "activity", tool: { name: "Read", itemId: "legacy" } });
    pending.set(`${bot.threadId}:legacy`, row.id);
    interruptToolMessages(store, pending, bot.threadId, undefined);
    expect(store.messagesFor(bot.threadId).find(message => message.id === row.id)?.tool).not.toHaveProperty("interrupted");
    expect(completeToolMessage(store, pending, bot.threadId, "legacy", undefined, true, "Original recorded output")).toBe("Read");
    expect(store.messagesFor(bot.threadId).find(message => message.id === row.id)?.tool).toMatchObject({ ok: true, output: "Original recorded output" });
  });
});
