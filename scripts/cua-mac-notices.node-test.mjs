// GrokOff: exercise real notice copying and packaged-resource rejection offline.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import afterPack from "./after-pack.mjs";
import {
  MAC_CUA_BUNDLE_NOTICE, MAC_CUA_SOURCE_DIRECTORY,
  copyMacCuaNativeNotice, validateMacCuaDependencies, verifyMacCuaApp,
} from "./cua-mac-notices.mjs";
import { MAC_CUA_RESOLVER_OVERRIDE, patchBundledMacCuaResolver } from "../third_party/cua-macos/source/grokoff-resolver-patch.mjs";

const script = fileURLToPath(new URL("./verify-mac-cua-notices.mjs", import.meta.url));

function scratch(t) {
  const root = mkdtempSync(join(tmpdir(), "grokoff-cua-notices-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function packageFile(directory, record) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify(record));
}

function dependencies(t, arch = "arm64") {
  const root = scratch(t);
  const dependencyRoot = join(root, "dependencies");
  const sdkRoot = join(dependencyRoot, "@trycua/cua-driver");
  const nativePackage = join(dependencyRoot, `@trycua/cua-driver-darwin-${arch}`);
  packageFile(sdkRoot, { name: "@trycua/cua-driver", version: "0.28.2", license: "MIT" });
  for (const name of ["@ubjs/core", "@ubjs/node"]) packageFile(join(dependencyRoot, name), { name, version: "0.31.0-3", license: "MPL-2.0" });
  packageFile(nativePackage, { name: `@trycua/cua-driver-darwin-${arch}`, version: "0.28.2", license: "MIT AND MPL-2.0", os: ["darwin"], cpu: [arch] });
  writeFileSync(join(nativePackage, "node-runtime-NOTICE.md"), readFileSync(join(MAC_CUA_SOURCE_DIRECTORY, "node-runtime-NOTICE.md")));
  return { root, sdkRoot, dependencyRoot, nativePackage, nativeDir: join(root, "staged/native"), arch };
}

function appFixture(t) {
  const root = scratch(t);
  const app = join(root, "GrokOff.app");
  const resources = join(app, "Contents", "Resources");
  const sourceRecord = join(resources, "licenses/third_party/cua-macos");
  cpSync(MAC_CUA_SOURCE_DIRECTORY, sourceRecord, { recursive: true });
  mkdirSync(join(resources, "cua-sdk/native"), { recursive: true });
  for (const name of ["cua-driver", "cua-sdk/native/libcua_driver_sdk.dylib", "cua-sdk/native/cua_driver_node_runtime.node"]) writeFileSync(join(resources, name), "Owned synthetic payload; never executed.");
  writeFileSync(join(resources, "cua-sdk/native/node-runtime-NOTICE.md"), readFileSync(join(MAC_CUA_SOURCE_DIRECTORY, "node-runtime-NOTICE.md")));
  const bundle = `${MAC_CUA_BUNDLE_NOTICE}\n${patchBundledMacCuaResolver("function resolveLibPath(opts) {\n  return 'owned fixture';\n}")}\n`;
  writeFileSync(join(resources, "cua-sdk/cua-sdk.mjs"), bundle);
  return { root, app, resources, sourceRecord, bundle };
}

for (const arch of ["arm64", "x64"]) test(`copies exact native NOTICE after pinned ${arch} dependency validation`, t => {
  const fixture = dependencies(t, arch);
  validateMacCuaDependencies(fixture);
  copyMacCuaNativeNotice(fixture);
  assert.deepEqual(readFileSync(join(fixture.nativeDir, "node-runtime-NOTICE.md")), readFileSync(join(MAC_CUA_SOURCE_DIRECTORY, "node-runtime-NOTICE.md")));
});

for (const [label, mutate] of [
  ["missing notice", fixture => rmSync(join(fixture.nativePackage, "node-runtime-NOTICE.md"))],
  ["empty notice", fixture => writeFileSync(join(fixture.nativePackage, "node-runtime-NOTICE.md"), "")],
  ["same-size changed notice", fixture => {
    const path = join(fixture.nativePackage, "node-runtime-NOTICE.md");
    const bytes = readFileSync(path); bytes[0] ^= 1; writeFileSync(path, bytes);
  }],
  ["native version drift", fixture => packageFile(fixture.nativePackage, { name: "@trycua/cua-driver-darwin-arm64", version: "0.28.3", license: "MIT AND MPL-2.0", os: ["darwin"], cpu: ["arm64"] })],
  ["wrong native license", fixture => packageFile(fixture.nativePackage, { name: "@trycua/cua-driver-darwin-arm64", version: "0.28.2", license: "MIT", os: ["darwin"], cpu: ["arm64"] })],
]) test(`fails before copying a ${label}`, t => {
  const fixture = dependencies(t);
  mutate(fixture);
  assert.throws(() => copyMacCuaNativeNotice(fixture));
  assert.equal(existsSync(fixture.nativeDir), false);
});

test("rejects drift in the separately bundled MPL JavaScript package", t => {
  const fixture = dependencies(t);
  packageFile(join(fixture.dependencyRoot, "@ubjs/core"), { name: "@ubjs/core", version: "0.32.0", license: "MPL-2.0" });
  assert.throws(() => validateMacCuaDependencies(fixture), /@ubjs\/core@0\.31\.0-3/);
});

test("rejects changed source records before copying any notice", t => {
  const fixture = dependencies(t);
  const recordDirectory = join(fixture.root, "record");
  cpSync(MAC_CUA_SOURCE_DIRECTORY, recordDirectory, { recursive: true });
  writeFileSync(join(recordDirectory, "source/ubjs-node-resolve-lib.ts"), "Pristine source omits the GrokOff modification.");
  assert.throws(() => copyMacCuaNativeNotice({ ...fixture, recordDirectory }), /source\/ubjs-node-resolve-lib\.ts/);
  assert.equal(existsSync(fixture.nativeDir), false);
});

test("verifies actual .app resources read-only from a separate working directory", t => {
  const fixture = appFixture(t);
  // A different staging tree must not satisfy or influence packaged checks.
  mkdirSync(join(fixture.root, "dist-native/arm64/cua-sdk"), { recursive: true });
  writeFileSync(join(fixture.root, "dist-native/arm64/cua-sdk/cua-sdk.mjs"), "Wrong staging output.");
  const result = spawnSync(process.execPath, [script, "--app", fixture.app], { cwd: fixture.root, env: {}, encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).verified, true);
  assert.equal(JSON.parse(result.stdout).fullNativeSbom, "pending");
  assert.equal(readFileSync(join(fixture.resources, "cua-sdk/cua-sdk.mjs"), "utf8"), fixture.bundle);
});

for (const name of ["cua-sdk/native/node-runtime-NOTICE.md", "licenses/third_party/cua-macos/source/ubjs-node-resolve-lib.ts", "cua-sdk/native/cua_driver_node_runtime.node"]) {
  test(`rejects missing packaged ${name}`, t => {
    const fixture = appFixture(t);
    rmSync(join(fixture.resources, name));
    assert.throws(() => verifyMacCuaApp(fixture.app));
  });
}

test("rejects a self-consistent altered manifest instead of trusting its own hashes", t => {
  const fixture = appFixture(t);
  const path = join(fixture.sourceRecord, "manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const core = manifest.components.find(component => component.name === "@ubjs/core");
  core.sourceCommit = manifest.components.find(component => component.name === "@ubjs/node").sourceCommit;
  writeFileSync(path, JSON.stringify(manifest));
  assert.throws(() => verifyMacCuaApp(fixture.app), /does not match the reviewed pin/);
});

test("rejects changed license bytes with the original reviewed manifest", t => {
  const fixture = appFixture(t);
  writeFileSync(join(fixture.sourceRecord, "MPL-2.0-LICENSE.txt"), "Other license text.");
  assert.throws(() => verifyMacCuaApp(fixture.app), /MPL-2\.0-LICENSE\.txt/);
});

test("rejects a bundle without its MPL/source notice", t => {
  const fixture = appFixture(t);
  writeFileSync(join(fixture.resources, "cua-sdk/cua-sdk.mjs"), fixture.bundle.slice(MAC_CUA_BUNDLE_NOTICE.length + 1));
  assert.throws(() => verifyMacCuaApp(fixture.app), /missing its MPL\/source notice/);
});

test("a resolver override mentioned only in a comment cannot satisfy the package gate", t => {
  const fixture = appFixture(t);
  const unpatched = `${MAC_CUA_BUNDLE_NOTICE}\n// ${MAC_CUA_RESOLVER_OVERRIDE}\nfunction resolveLibPath(opts) {\n  return 'unpatched';\n}\n`;
  writeFileSync(join(fixture.resources, "cua-sdk/cua-sdk.mjs"), unpatched);
  assert.throws(() => verifyMacCuaApp(fixture.app), /missing its documented resolver modification/);
});

for (const name of ["cua-sdk/native/node-runtime-NOTICE.md", "licenses/third_party/cua-macos", "cua-sdk"]) {
  test(`rejects a symlinked packaged ${name}`, { skip: process.platform === "win32" }, t => {
    const fixture = appFixture(t);
    const original = join(fixture.resources, name);
    const replacement = join(fixture.root, "replacement");
    cpSync(original, replacement, { recursive: true });
    rmSync(original, { recursive: true });
    symlinkSync(replacement, original, name.endsWith(".md") ? "file" : "dir");
    assert.throws(() => verifyMacCuaApp(fixture.app), /must be a (?:real directory|nonempty regular file)/);
  });
}

test("real Darwin afterPack contexts reject missing CUA before other package checks", async t => {
  const root = scratch(t);
  const resources = join(root, "resources");
  mkdirSync(join(resources, "licenses/third_party"), { recursive: true });
  await assert.rejects(afterPack({ electronPlatformName: "darwin", appOutDir: root,
    packager: { getResourcesDir: () => resources } }), /cua-macos/);
});

test("afterPack rejects missing CUA notice when copied CUA resources are present", async t => {
  const fixture = appFixture(t);
  rmSync(join(fixture.resources, "cua-sdk/native/node-runtime-NOTICE.md"));
  await assert.rejects(afterPack({ electronPlatformName: "darwin", appOutDir: dirname(fixture.app),
    packager: { getResourcesDir: () => fixture.resources } }), /node-runtime-NOTICE\.md/);
});
