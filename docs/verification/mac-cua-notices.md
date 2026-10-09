# Mac CUA notices and source record

GrokOff's Mac package must preserve the exact Cua 0.28.2 native runtime notice,
the MPL source routes for `@ubjs/core` and `@ubjs/node` 0.31.0-3, and the Cua and
GrokOff source modifications. The dedicated record is in
[`third_party/cua-macos`](../../third_party/cua-macos/README.md). The inherited
Linux Cua 0.19.3 SBOM does not describe the Mac runtime.

## Portable fixture

```sh
node --test scripts/cua-mac-notices.node-test.mjs
```

Every mutation uses a disposable directory. Fake native payloads are never
executed. The fixture validates notice copying for both Mac architectures,
changed versions/licenses/content, source and license tampering, symlinks,
the bundle notice and real resolver override, and the Darwin after-pack gate.
It also launches the read-only verifier against a synthetic `.app` from a
separate working directory, proving that checking staging cannot substitute
for checking the delivered package. The fixture is adopted into `test:core`.

## Actual package check

Preparation validates the pinned source record and installed package metadata
before native staging, then copies the reviewed runtime notice beside the
`.node`. The existing Mac after-pack hook checks copied resources before
signing; it fails when required records or resources are absent, including
when electron-builder merely warned about a missing copy input.

Inspect an already prepared package without launching or changing it:

```sh
node scripts/verify-mac-cua-notices.mjs --app /absolute/path/GrokOff.app
```

The command validates the files under that `.app/Contents/Resources`, checks
reviewed manifest/content hashes and regular files/directories, and prints a
JSON result. It makes no provider calls, downloads, native execution or file
writes. A missing runtime notice or an older Linux-only record must fail.
Retain the result privately with the exact candidate path and build evidence.

This check covers notices and corresponding source records. It does not
validate signed native bytes, prove a complete native SBOM, qualify real
computer control, or establish public binary release readiness. The complete
Mac CLI/SDK/N-API build inventory remains pending; signing/notarization,
clean-install acceptance and release approval remain separate checks.
