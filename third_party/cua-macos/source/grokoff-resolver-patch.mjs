/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// GrokOff modification (2026-10-09): resolve the staged Mac SDK library.
// Keep this transformation beside the modified preferred TypeScript source.
export const MAC_CUA_RESOLVER_OVERRIDE = "if (process.env.OPENMAUSBOT_CUA_SDK_LIBRARY) return resolveOverride(opts.crateName, process.env.OPENMAUSBOT_CUA_SDK_LIBRARY);";

export function patchBundledMacCuaResolver(source) {
  const pattern = /function resolveLibPath\d*\(opts\) \{/g;
  const matches = source.match(pattern) ?? [];
  if (matches.length !== 1 || source.includes(MAC_CUA_RESOLVER_OVERRIDE)) {
    throw new Error("Could not apply the single reviewed Mac CUA resolver modification");
  }
  return source.replace(pattern, `${matches[0]}\n      ${MAC_CUA_RESOLVER_OVERRIDE}`);
}
