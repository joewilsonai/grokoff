/** Provider tool receipts are owned by the recorded turn, not just an item ID.
 * Stopping a turn records an unknown outcome, never a failed or undone action. */
import type { Store } from "./store.ts";

type ToolStore = Pick<Store, "messagesFor" | "patchMessage">;

export function completeToolMessage(
  store: ToolStore, pending: Map<string, string>, threadId: string, itemId: string,
  turnId: string | undefined, ok: boolean, output: string | undefined,
): string | null {
  const key = `${threadId}:${itemId}`;
  const messageId = pending.get(key);
  if (!messageId) return null;
  const message = store.messagesFor(threadId).find(row => row.id === messageId);
  if (!message?.tool || message.tool.interrupted ||
      (message.turnId && message.turnId !== turnId)) return null;
  // Carry the recorded input, narration and other metadata across the outcome.
  store.patchMessage(threadId, messageId, { tool: { ...message.tool, ok, output } });
  pending.delete(key);
  return message.tool.name;
}

export function interruptToolMessages(
  store: ToolStore, pending: Map<string, string>, threadId: string, turnId: string | undefined,
): void {
  if (!turnId) return; // An unscoped completion cannot prove which receipt stopped.
  for (const message of store.messagesFor(threadId)) {
    const tool = message.tool;
    if (message.role !== "bot" || message.kind !== "activity" || message.turnId !== turnId ||
        !tool?.itemId || tool.ok !== undefined || tool.interrupted) continue;
    store.patchMessage(threadId, message.id, { tool: { ...tool, interrupted: true } });
    const key = `${threadId}:${tool.itemId}`;
    // A replacement turn can already own this provider item ID.
    if (pending.get(key) === message.id) pending.delete(key);
  }
}
