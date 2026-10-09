// Copyright 2026 Joe Wilson. SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const ELECTRON_NOTICE_FILES = Object.freeze([
  Object.freeze({ source: "LICENSE", packaged: "Electron-LICENSE.txt" }),
  Object.freeze({ source: "LICENSES.chromium.html", packaged: "Electron-LICENSES.chromium.html" }),
]);
const extracted = new WeakMap();
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

async function realDirectory(directory) {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Electron notices require a real directory: ${directory}`);
}
async function regularBytes(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Electron notice must be a regular file: ${file}`);
  const bytes = await readFile(file);
  if (!bytes.length) throw new Error(`Electron notice must not be empty: ${file}`);
  return bytes;
}
function runtime(context) {
  const framework = context.packager.info.framework;
  if (context.electronPlatformName !== "darwin" || ![1, 3].includes(context.arch)
    || framework.distMacOsAppName !== "Electron.app"
    || context.packager.config.electronDist || context.packager.config.electronBranding) {
    throw new Error("GrokOff Electron notices require the standard macOS Electron distribution");
  }
  if (typeof framework.version !== "string" || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(framework.version)) {
    throw new Error("Electron notice validation requires the builder's runtime version");
  }
  return { version: framework.version, platform: context.electronPlatformName, arch: context.arch };
}

/** Runs immediately after electron-builder extracts its actual target archive,
 * before Mac branding removes the two root notice files. */
export default async function retainElectronNotices(context) {
  if (context.packager?.config?.appId !== "app.grokoff.desktop") return;
  const identity = runtime(context);
  const outDir = path.resolve(context.appOutDir);
  const copies = [];
  for (const item of ELECTRON_NOTICE_FILES) copies.push({ ...item, bytes: await regularBytes(path.join(outDir, item.source)) });
  const resources = path.join(outDir, "Electron.app", "Contents", "Resources");
  for (const directory of [outDir, path.join(outDir, "Electron.app"), path.join(outDir, "Electron.app", "Contents"), resources]) await realDirectory(directory);
  const licenses = path.join(resources, "licenses");
  await mkdir(licenses, { recursive: true });
  await realDirectory(licenses);
  for (const item of copies) await writeFile(path.join(licenses, item.packaged), item.bytes, { flag: "wx", mode: 0o644 });
  const receipt = Object.freeze({ ...identity, files: Object.freeze(copies.map(item => Object.freeze({
    name: item.packaged, bytes: item.bytes.length, sha256: digest(item.bytes),
  }))) });
  let targets = extracted.get(context.packager);
  if (!targets) extracted.set(context.packager, targets = new Map());
  targets.set(outDir, receipt);
  return receipt;
}

/** Read-only byte validation against the extraction hook's frozen receipt. */
export async function verifyElectronNotices(resources, expected) {
  await realDirectory(path.join(resources, "licenses"));
  for (const item of expected.files) {
    const bytes = await regularBytes(path.join(resources, "licenses", item.name));
    if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) {
      throw new Error(`Packaged Electron notice differs from extracted runtime: ${item.name}`);
    }
  }
  return expected;
}

/** Require proof from this same builder/target, rather than trusting a
 * self-described manifest supplied inside a package. */
export async function verifyGrokOffElectronNotices(context, resources) {
  if (context.packager?.config?.appId !== "app.grokoff.desktop") return;
  const identity = runtime(context);
  const expected = extracted.get(context.packager)?.get(path.resolve(context.appOutDir));
  if (!expected) throw new Error("Missing Electron notice extraction receipt; configure afterExtract");
  if (expected.version !== identity.version || expected.platform !== identity.platform || expected.arch !== identity.arch) {
    throw new Error("Electron notice runtime/target changed after extraction");
  }
  return verifyElectronNotices(resources, expected);
}
