// GrokOff: the editor can save a new bot's memory before any first chat.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { MEMORY_INDEX, hashMemoryText, readMemoryDoc, writeMemoryDoc } from "./memory-store.ts";
import { workspaceDir } from "./workspace.ts";

it("saves the first index edit against the empty hash before a bot has run", () => {
  const bot = "first-memory-edit";
  const opened = readMemoryDoc(bot, MEMORY_INDEX);
  expect(opened).toMatchObject({ exists: false, text: "", hash: hashMemoryText("") });
  expect(existsSync(workspaceDir(bot))).toBe(false);
  const text = "- Prefers compact project reports\n";
  const saved = writeMemoryDoc(bot, MEMORY_INDEX, text, { expectedHash: opened.hash });
  expect(saved).toMatchObject({ before: null, after: text, hash: hashMemoryText(text) });
  expect(readMemoryDoc(bot, MEMORY_INDEX)).toMatchObject({ exists: true, text });
  if (process.platform !== "win32") expect(statSync(join(workspaceDir(bot), MEMORY_INDEX)).mode & 0o777).toBe(0o600);
});
