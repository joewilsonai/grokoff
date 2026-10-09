# Electron runtime notices

GrokOff's Mac source-alpha package retains the actual target Electron distribution's
`LICENSE` and generated `LICENSES.chromium.html` as
`resources/licenses/Electron-LICENSE.txt` and
`resources/licenses/Electron-LICENSES.chromium.html`. These supplement the
separate bot-browser and application notices; their contents remain unchanged.

Electron's [MIT license](https://github.com/electron/electron/blob/v43.7.9/LICENSE)
and the generated notices accompany the official
[43.7.9 release distribution](https://github.com/electron/electron/releases/tag/v43.7.9).
The lockfile selects the runtime version. Generated credits are build output,
not a notice text reconstructed from the source-alpha license or Chromium's
separate bot-browser archive.

`pnpm package:grokoff` copies both files immediately after electron-builder
extracts the target runtime archive. This happens before Mac branding removes
the two original notice files. A frozen receipt stays inside that build process;
its pre-signing package hook compares the retained files with those exact
extracted bytes and checks that the runtime version/target did not change.
Missing, empty, changed or symlinked notice files fail the build. The gate also
rejects a missing extraction hook. These are the target archive's generated
credits, so no other installed Electron or bot-browser notices substitute for
them. Custom Electron distributions remain outside this alpha's packaging path.

The portable disposable checks are in
`scripts/electron-runtime-notices.node-test.mjs` and run through `test:core`.
They do not launch Electron. A notice-copy gate is not a complete native SBOM,
a signed/notarized release, or clean-install acceptance. Other bundled native
dependencies still need their own inventory and provenance.
