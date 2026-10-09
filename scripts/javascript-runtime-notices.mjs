// Copyright 2026 Joe Wilson. SPDX-License-Identifier: Apache-2.0
// A bounded notice gate for five observed JS components, not a complete SBOM.
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const JAVASCRIPT_NOTICE_DIRECTORY = fileURLToPath(new URL("../third_party/javascript-runtime", import.meta.url));
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const manifestHash = "317303de28a2b824d7eb562147307a90457a3d08a503f13b8fd22bffa27e10ab";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

function realDirectory(directory) {
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`JavaScript notices require a real directory: ${directory}`);
}
function regularBytes(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`JavaScript notice input must be a nonempty regular file: ${file}`);
  const bytes = readFileSync(file);
  if (!bytes.length) throw new Error(`JavaScript notice input must be a nonempty regular file: ${file}`);
  return bytes;
}
function checkedBytes(file, expected) {
  const bytes = regularBytes(file);
  if ((expected.bytes !== undefined && bytes.length !== expected.bytes) || digest(bytes) !== expected.sha256) {
    throw new Error(`JavaScript notice differs from the reviewed npm bytes: ${file}`);
  }
  return bytes;
}
function reviewedCatalogue() {
  realDirectory(JAVASCRIPT_NOTICE_DIRECTORY);
  const bytes = checkedBytes(path.join(JAVASCRIPT_NOTICE_DIRECTORY, "manifest.json"), { sha256: manifestHash });
  const catalogue = JSON.parse(bytes);
  for (const item of catalogue.components) checkedBytes(path.join(JAVASCRIPT_NOTICE_DIRECTORY, item.retainedFile), item);
  return catalogue;
}

/** Check the package inputs before compiling or bundling; no downloads/writes. */
export function validateInstalledJavaScriptNotices(dependencyRoot = path.join(projectRoot, "node_modules")) {
  const catalogue = reviewedCatalogue();
  for (const item of catalogue.components) {
    // pnpm's package directories may be symlinks; original npm files must be
    // regular. No lockfile-wide or development-dependency inventory is claimed.
    const directory = path.join(dependencyRoot, item.name);
    const pkg = JSON.parse(regularBytes(path.join(directory, "package.json")));
    if (pkg.name !== item.name || pkg.version !== item.version || pkg.license !== item.license) {
      throw new Error(`JavaScript notices require the reviewed ${item.name}@${item.version} (${item.license})`);
    }
    checkedBytes(path.join(directory, item.sourceFile), item);
  }
  return catalogue;
}

/** Read only the actual package's copied files, independent of staging output. */
export function verifyPackagedJavaScriptNotices(resources) {
  const catalogue = reviewedCatalogue();
  const licenses = path.join(resources, "licenses");
  const thirdParty = path.join(licenses, "third_party");
  const directory = path.join(thirdParty, "javascript-runtime");
  for (const parent of [resources, licenses, thirdParty, directory]) realDirectory(parent);
  checkedBytes(path.join(directory, "manifest.json"), { sha256: manifestHash });
  const unique = [...new Map(catalogue.components.map(item => [item.retainedFile, item])).values()];
  for (const item of unique) checkedBytes(path.join(directory, item.retainedFile), item);
  return {
    verified: true,
    scope: "five-observed-JavaScript-components",
    fullJavaScriptInventory: "pending",
    manifestSha256: manifestHash,
    components: catalogue.components.map(({ name, version, license }) => ({ name, version, license })),
    files: unique.map(({ retainedFile, bytes, sha256 }) => ({ name: retainedFile, bytes, sha256 })),
  };
}

/** The real GrokOff Mac hook also checks the source inputs if prepare was bypassed. */
export function verifyGrokOffJavaScriptNotices(context, resources) {
  if (context.packager?.config?.appId !== "app.grokoff.desktop") return;
  if (context.electronPlatformName !== "darwin" || ![1, 3].includes(context.arch)) {
    throw new Error("GrokOff JavaScript notices require a supported macOS target");
  }
  const directory = context.packager.info?.projectDir;
  if (typeof directory !== "string" || !path.isAbsolute(directory)) {
    throw new Error("JavaScript notice validation requires the builder's project directory");
  }
  validateInstalledJavaScriptNotices(path.join(directory, "node_modules"));
  return verifyPackagedJavaScriptNotices(resources);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3 || process.argv[2] !== "--check-installed") throw new Error("Usage: node scripts/javascript-runtime-notices.mjs --check-installed");
  const catalogue = validateInstalledJavaScriptNotices();
  console.log(JSON.stringify({ verified: true, scope: "five-observed-JavaScript-components", fullJavaScriptInventory: "pending", components: catalogue.components.map(({ name, version }) => ({ name, version })) }));
}
