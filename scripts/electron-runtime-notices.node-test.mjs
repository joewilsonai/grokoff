// Copyright 2026 Joe Wilson. SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import afterPack from "./after-pack.mjs";
import retainElectronNotices, { ELECTRON_NOTICE_FILES, verifyElectronNotices, verifyGrokOffElectronNotices } from "./electron-runtime-notices.mjs";

async function fixture(t, extract = true, packager) {
  const root = await mkdtemp(path.join(os.tmpdir(), "grokoff-electron-notices-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const rawResources = path.join(root, "Electron.app", "Contents", "Resources");
  await mkdir(rawResources, { recursive: true });
  for (const item of ELECTRON_NOTICE_FILES) await writeFile(path.join(root, item.source), `${item.source}: ${path.basename(root)}\r\n© synthetic fixture\n`);
  const context = { appOutDir: root, electronPlatformName: "darwin", arch: 3,
    packager: packager ?? { config: { appId: "app.grokoff.desktop" },
      info: { framework: { version: "43.7.9", distMacOsAppName: "Electron.app" } } } };
  let receipt;
  if (extract) {
    receipt = await retainElectronNotices(context);
    // Mirror Mac branding: original notice paths are removed and the .app is renamed.
    for (const item of ELECTRON_NOTICE_FILES) await rm(path.join(root, item.source));
    await rename(path.join(root, "Electron.app"), path.join(root, "GrokOff.app"));
  }
  const resources = extract ? path.join(root, "GrokOff.app", "Contents", "Resources") : rawResources;
  return { root, resources, licenses: path.join(resources, "licenses"), context, receipt };
}

test("retains both actual extraction notices through Mac branding", async t => {
  const f = await fixture(t);
  const receipt = await verifyGrokOffElectronNotices(f.context, f.resources);
  assert.equal(receipt.version, "43.7.9");
  assert.deepEqual(receipt.files.map(file => file.name), ELECTRON_NOTICE_FILES.map(file => file.packaged));
  assert(receipt.files.every(file => file.bytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256)));
  assert(Object.isFrozen(receipt) && Object.isFrozen(receipt.files) && receipt.files.every(Object.isFrozen));
});

for (const item of ELECTRON_NOTICE_FILES) {
  test(`rejects missing ${item.packaged}`, async t => {
    const f = await fixture(t);
    await rm(path.join(f.licenses, item.packaged));
    await assert.rejects(verifyGrokOffElectronNotices(f.context, f.resources), { code: "ENOENT" });
  });
  test(`rejects truncated or changed ${item.packaged}`, async t => {
    const f = await fixture(t);
    await writeFile(path.join(f.licenses, item.packaged), "");
    await assert.rejects(verifyGrokOffElectronNotices(f.context, f.resources), /must not be empty/);
    await writeFile(path.join(f.licenses, item.packaged), "different notice");
    await assert.rejects(verifyGrokOffElectronNotices(f.context, f.resources), /differs from extracted runtime/);
  });
  test(`rejects symlinked ${item.packaged}`, async t => {
    const f = await fixture(t);
    const other = path.join(f.root, "other-notice");
    await writeFile(other, await readFile(path.join(f.licenses, item.packaged)));
    await rm(path.join(f.licenses, item.packaged));
    await symlink(other, path.join(f.licenses, item.packaged));
    await assert.rejects(verifyGrokOffElectronNotices(f.context, f.resources), /must be a regular file/);
  });
  test(`rejects missing extraction source ${item.source} before copying`, async t => {
    const f = await fixture(t, false);
    await rm(path.join(f.root, item.source));
    await assert.rejects(retainElectronNotices(f.context), { code: "ENOENT" });
    await assert.rejects(readFile(path.join(f.licenses, ELECTRON_NOTICE_FILES[0].packaged)), { code: "ENOENT" });
  });
}

test("rejects a symlinked license directory before extraction writes", async t => {
  const f = await fixture(t, false);
  const other = path.join(f.root, "other-licenses");
  await mkdir(other);
  await symlink(other, f.licenses, "dir");
  await assert.rejects(retainElectronNotices(f.context), /real directory/);
});

test("rejects a symlinked package license directory", async t => {
  const f = await fixture(t);
  const other = path.join(f.root, "other-licenses");
  await mkdir(other);
  await rm(f.licenses, { recursive: true });
  await symlink(other, f.licenses, "dir");
  await assert.rejects(verifyGrokOffElectronNotices(f.context, f.resources), /real directory/);
});

test("rejects missing extraction receipts and changed runtime identity", async t => {
  const missing = await fixture(t, false);
  await assert.rejects(verifyGrokOffElectronNotices(missing.context, missing.resources), /configure afterExtract/);
  const f = await fixture(t);
  f.context.packager.info.framework.version = "44.0.0";
  await assert.rejects(verifyGrokOffElectronNotices(f.context, f.resources), /changed after extraction/);
  f.context.packager.info.framework.version = undefined;
  await assert.rejects(verifyGrokOffElectronNotices(f.context, f.resources), /runtime version/);
});

test("keeps extraction receipts distinct across output targets on the same packager", async t => {
  const one = await fixture(t);
  const two = await fixture(t, true, one.context.packager);
  assert.notEqual(one.receipt.files[0].sha256, two.receipt.files[0].sha256);
  await verifyGrokOffElectronNotices(one.context, one.resources);
  await verifyGrokOffElectronNotices(two.context, two.resources);
  await assert.rejects(verifyElectronNotices(one.resources, two.receipt), /differs from extracted runtime/);
});

test("retains the upstream hook's partial fixture contract", async () => {
  assert.equal(await retainElectronNotices({}), undefined);
  assert.equal(await verifyGrokOffElectronNotices({}, "unused"), undefined);
  assert.equal(await verifyGrokOffElectronNotices({ packager: { config: { appId: "upstream" } } }, "unused"), undefined);
});

test("real GrokOff hook contexts reject unsupported or custom runtime targets", async t => {
  const f = await fixture(t, false);
  await assert.rejects(afterPack({ ...f.context, electronPlatformName: "linux" }), /standard macOS Electron distribution/);
  await assert.rejects(retainElectronNotices({ ...f.context, arch: 4 }), /standard macOS Electron distribution/);
  for (const key of ["electronDist", "electronBranding"]) {
    f.context.packager.config[key] = "custom";
    await assert.rejects(retainElectronNotices(f.context), /standard macOS Electron distribution/);
    delete f.context.packager.config[key];
  }
});

test("GrokOff config retains notices before branding and validates after copying", async () => {
  const config = parse(await readFile(new URL("../electron-builder.grokoff.yml", import.meta.url), "utf8"));
  assert.equal(config.appId, "app.grokoff.desktop");
  assert.equal(config.afterExtract, "./scripts/electron-runtime-notices.mjs");
  assert.equal(config.afterPack, "./scripts/after-pack.mjs");
});
