// Copyright 2026 Joe Wilson. SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { JAVASCRIPT_NOTICE_DIRECTORY, validateInstalledJavaScriptNotices, verifyGrokOffJavaScriptNotices, verifyPackagedJavaScriptNotices } from "./javascript-runtime-notices.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "grokoff-js-notices-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const resources = path.join(root, "GrokOff.app/Contents/Resources");
  const record = path.join(resources, "licenses/third_party/javascript-runtime");
  cpSync(JAVASCRIPT_NOTICE_DIRECTORY, record, { recursive: true });
  const catalogue = JSON.parse(readFileSync(path.join(record, "manifest.json")));
  const dependencyRoot = path.join(root, "node_modules");
  for (const item of catalogue.components) {
    const directory = path.join(dependencyRoot, item.name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: item.name, version: item.version, license: item.license }));
    cpSync(path.join(record, item.retainedFile), path.join(directory, item.sourceFile));
  }
  const context = { electronPlatformName: "darwin", arch: 3,
    packager: { config: { appId: "app.grokoff.desktop" }, info: { projectDir: root } } };
  return { root, resources, record, catalogue, dependencyRoot, context };
}

test("checks original installed inputs and exact copied Mac notices without changing them", t => {
  const f = fixture(t);
  const before = readFileSync(path.join(f.record, "manifest.json"));
  validateInstalledJavaScriptNotices(f.dependencyRoot);
  const proof = verifyGrokOffJavaScriptNotices(f.context, f.resources);
  assert.equal(proof.verified, true);
  assert.equal(proof.fullJavaScriptInventory, "pending");
  assert.equal(proof.components.length, 7);
  assert.equal(proof.files.length, 6);
  assert.deepEqual(readFileSync(path.join(f.record, "manifest.json")), before);
});

for (const name of ["react-LICENSE.txt", "ajv-LICENSE.txt", "croner-LICENSE.txt", "electron-updater-LICENSE.txt", "lucide-react-LICENSE.txt", "mermaid-LICENSE.txt", "manifest.json"]) {
  for (const mutation of ["missing", "same-size altered"]) test(`rejects ${mutation} actual packaged ${name}`, t => {
    const f = fixture(t);
    const file = path.join(f.record, name);
    if (mutation === "missing") rmSync(file);
    else { const bytes = readFileSync(file); bytes[0] ^= 1; writeFileSync(file, bytes); }
    assert.throws(() => verifyPackagedJavaScriptNotices(f.resources));
  });
}

for (const field of ["name", "version", "license"]) test(`rejects installed package ${field} drift before packaging`, t => {
  const f = fixture(t);
  const file = path.join(f.dependencyRoot, "react-dom/package.json");
  const pkg = JSON.parse(readFileSync(file)); pkg[field] = "different";
  writeFileSync(file, JSON.stringify(pkg));
  assert.throws(() => validateInstalledJavaScriptNotices(f.dependencyRoot), /react-dom@19\.2\.8/);
  assert.throws(() => verifyGrokOffJavaScriptNotices(f.context, f.resources), /react-dom@19\.2\.8/);
});

for (const mutation of ["missing", "same-size altered"]) test(`rejects ${mutation} original installed npm LICENSE`, t => {
  const f = fixture(t); const file = path.join(f.dependencyRoot, "croner/LICENSE");
  if (mutation === "missing") rmSync(file);
  else { const bytes = readFileSync(file); bytes[0] ^= 1; writeFileSync(file, bytes); }
  assert.throws(() => validateInstalledJavaScriptNotices(f.dependencyRoot));
});

test("a self-consistent edited package manifest cannot authorize changed license bytes", t => {
  const f = fixture(t);
  const catalogue = f.catalogue;
  catalogue.components[0].sha256 = "0".repeat(64);
  writeFileSync(path.join(f.record, "manifest.json"), JSON.stringify(catalogue));
  assert.throws(() => verifyPackagedJavaScriptNotices(f.resources), /differs from the reviewed npm bytes/);
});

for (const relative of ["", "licenses", "licenses/third_party", "licenses/third_party/javascript-runtime", "licenses/third_party/javascript-runtime/react-LICENSE.txt"]) {
  test(`rejects symlinked actual package path ${relative || 'Resources'}`, { skip: process.platform === "win32" }, t => {
    const f = fixture(t); const original = path.join(f.resources, relative);
    const replacement = path.join(f.root, "replacement");
    cpSync(original, replacement, { recursive: true }); rmSync(original, { recursive: true });
    symlinkSync(replacement, original, relative.endsWith(".txt") ? "file" : "dir");
    assert.throws(() => verifyPackagedJavaScriptNotices(f.resources), /real directory|regular file/);
  });
}

test("GrokOff real contexts fail closed while upstream partial fixtures retain their contract", t => {
  const f = fixture(t);
  assert.equal(verifyGrokOffJavaScriptNotices({}, "unused"), undefined);
  assert.equal(verifyGrokOffJavaScriptNotices({ packager: { config: { appId: "upstream" } } }, "unused"), undefined);
  assert.throws(() => verifyGrokOffJavaScriptNotices({ ...f.context, arch: 4 }, f.resources), /supported macOS target/);
  assert.throws(() => verifyGrokOffJavaScriptNotices({ ...f.context, electronPlatformName: "linux" }, f.resources), /supported macOS target/);
  delete f.context.packager.info.projectDir;
  assert.throws(() => verifyGrokOffJavaScriptNotices(f.context, f.resources), /builder's project directory/);
});
