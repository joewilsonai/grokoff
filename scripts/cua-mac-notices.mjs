// GrokOff Mac CUA notice/source inventory gate. This is not a native SBOM.
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { MAC_CUA_RESOLVER_OVERRIDE } from "../third_party/cua-macos/source/grokoff-resolver-patch.mjs";

export const MAC_CUA_VERSION = "0.28.2";
export const MAC_CUA_UBJS_VERSION = "0.31.0-3";
export const MAC_CUA_NATIVE_NOTICE_SHA256 = "66a466cc022b4bf4a41f678e4d31d9b82098cc55cc364d6e9295366dfd02cef2";
// A packaged record cannot appoint itself as its own trust anchor.
export const MAC_CUA_SOURCE_MANIFEST_SHA256 = "4fa2cf0ba1719f25a7bdd3722bfc6d0d83b5e5ae2706164c6851e8e3bde2447a";
export const MAC_CUA_SOURCE_DIRECTORY = fileURLToPath(new URL("../third_party/cua-macos/", import.meta.url));
export const MAC_CUA_BUNDLE_NOTICE = `/* GrokOff Mac CUA ${MAC_CUA_VERSION}: includes @ubjs/core and @ubjs/node ${MAC_CUA_UBJS_VERSION} under MPL-2.0.
 * Covered source and modifications retain MPL-2.0; the Cua SDK retains MIT.
 * Exact sources, licenses and GrokOff resolver modification: ../licenses/third_party/cua-macos/README.md
 * The complete Mac native SBOM remains pending. */`;

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function realDirectory(directory) {
  const details = lstatSync(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) throw new Error(`Mac CUA resource must be a real directory: ${directory}`);
}

function regularBytes(directory, name) {
  realDirectory(directory);
  const file = resolve(directory, name);
  const inside = relative(resolve(directory), file);
  if (isAbsolute(inside) || inside === ".." || inside.startsWith(`..${sep}`)) throw new Error(`Mac CUA path escapes its resource root: ${name}`);
  const parts = inside.split(sep);
  for (let index = 1; index < parts.length; index += 1) realDirectory(join(directory, ...parts.slice(0, index)));
  const details = lstatSync(file);
  if (!details.isFile() || details.isSymbolicLink() || details.size === 0) throw new Error(`Mac CUA resource must be a nonempty regular file: ${file}`);
  return readFileSync(file);
}

export function verifyMacCuaSourceRecord(directory = MAC_CUA_SOURCE_DIRECTORY) {
  const bytes = regularBytes(directory, "manifest.json");
  if (sha256(bytes) !== MAC_CUA_SOURCE_MANIFEST_SHA256) throw new Error("Mac CUA source manifest does not match the reviewed pin");
  const manifest = JSON.parse(bytes.toString("utf8"));
  for (const file of manifest.files) {
    if (sha256(regularBytes(directory, file.path)) !== file.sha256) throw new Error(`Mac CUA source/license record changed: ${file.path}`);
  }
  return manifest;
}

function requirePackage(directory, name, version, license) {
  const record = JSON.parse(regularBytes(directory, "package.json").toString("utf8"));
  if (record.name !== name || record.version !== version || record.license !== license) {
    throw new Error(`Mac CUA package must be ${name}@${version} with license ${license}`);
  }
  return record;
}

function nativeNotice(nativePackage, arch) {
  if (!["arm64", "x64"].includes(arch)) throw new Error(`Unsupported Mac CUA notice architecture: ${arch}`);
  const directory = realpathSync(nativePackage); // pnpm's installed package links are expected.
  const record = requirePackage(directory, `@trycua/cua-driver-darwin-${arch}`, MAC_CUA_VERSION, "MIT AND MPL-2.0");
  if (JSON.stringify(record.os) !== '["darwin"]' || JSON.stringify(record.cpu) !== JSON.stringify([arch])) {
    throw new Error(`Mac CUA native package target does not match darwin-${arch}`);
  }
  const notice = regularBytes(directory, "node-runtime-NOTICE.md");
  if (sha256(notice) !== MAC_CUA_NATIVE_NOTICE_SHA256) throw new Error("Mac CUA native runtime notice does not match the reviewed pin");
  return notice;
}

/** Validate before downloading/staging; no native code or providers run here. */
export function validateMacCuaDependencies({ sdkRoot, dependencyRoot, arch, recordDirectory = MAC_CUA_SOURCE_DIRECTORY }) {
  verifyMacCuaSourceRecord(recordDirectory);
  requirePackage(realpathSync(sdkRoot), "@trycua/cua-driver", MAC_CUA_VERSION, "MIT");
  for (const name of ["@ubjs/core", "@ubjs/node"]) {
    requirePackage(realpathSync(join(dependencyRoot, name)), name, MAC_CUA_UBJS_VERSION, "MPL-2.0");
  }
  nativeNotice(join(dependencyRoot, "@trycua", `cua-driver-darwin-${arch}`), arch);
}

/** Copy only validated bytes into a fresh, fixture- or build-owned directory. */
export function copyMacCuaNativeNotice({ nativePackage, nativeDir, arch, recordDirectory = MAC_CUA_SOURCE_DIRECTORY }) {
  verifyMacCuaSourceRecord(recordDirectory);
  const notice = nativeNotice(nativePackage, arch);
  mkdirSync(nativeDir, { recursive: true });
  realDirectory(nativeDir);
  writeFileSync(join(nativeDir, "node-runtime-NOTICE.md"), notice, { flag: "wx", mode: 0o644 });
}

/** Inspect actual copied resources; signed/thinned binary hashes are separate. */
export function verifyMacCuaResources(resources) {
  realDirectory(resources);
  const recordDirectory = join(resources, "licenses", "third_party", "cua-macos");
  // Check every expected ancestor, not merely the final record directory.
  regularBytes(resources, "licenses/third_party/cua-macos/manifest.json");
  verifyMacCuaSourceRecord(recordDirectory);
  for (const name of ["cua-driver", "cua-sdk/native/libcua_driver_sdk.dylib", "cua-sdk/native/cua_driver_node_runtime.node"]) regularBytes(resources, name);
  const notice = regularBytes(resources, "cua-sdk/native/node-runtime-NOTICE.md");
  if (sha256(notice) !== MAC_CUA_NATIVE_NOTICE_SHA256) throw new Error("Packaged Mac CUA native runtime notice does not match the reviewed pin");
  const bundle = regularBytes(resources, "cua-sdk/cua-sdk.mjs").toString("utf8");
  if (!bundle.startsWith(`${MAC_CUA_BUNDLE_NOTICE}\n`)) throw new Error("Packaged Mac CUA bundle is missing its MPL/source notice");
  const resolvers = bundle.match(/function resolveLibPath\d*\(opts\) \{/g) ?? [];
  if (resolvers.length !== 1 || !bundle.includes(`${resolvers[0]}\n      ${MAC_CUA_RESOLVER_OVERRIDE}`)) {
    throw new Error("Packaged Mac CUA bundle is missing its documented resolver modification");
  }
  return { verified: true, cuaVersion: MAC_CUA_VERSION, ubjsVersion: MAC_CUA_UBJS_VERSION,
    noticeSha256: MAC_CUA_NATIVE_NOTICE_SHA256, sourceManifestSha256: MAC_CUA_SOURCE_MANIFEST_SHA256,
    fullNativeSbom: "pending", scope: "Packaged Mac CUA notices and source record; no native execution or full binary provenance claim." };
}

export function verifyMacCuaApp(app) {
  realDirectory(app);
  realDirectory(join(app, "Contents"));
  return verifyMacCuaResources(join(app, "Contents", "Resources"));
}
