# Observed JavaScript runtime notices

This is an intentionally partial inventory of seven directly observed bundled
components: React and React DOM 19.2.8 in the UI, Ajv 8.20.0 and Croner 10.0.1
in the server, electron-updater 6.8.9 in the physically retained updater, and
Lucide React 0.539.0 and Mermaid 12.1.0 in emitted UI assets.
The updater remains disabled. This is not a complete dependency SBOM, native
inventory, license clearance, or binary release acceptance.

The original npm `LICENSE` files are copied byte for byte. React and React DOM
have identical text and share one retained copy, giving six original texts.
Lucide React's ISC text retains its Cole Bemis/Feather attribution verbatim;
the other observed packages use MIT. `manifest.json` records each package
version, license identifier, npm source file/archive URL, byte count and
SHA-256. The Apache-2.0 application license does not replace these grants.

`package:grokoff:prepare` checks those installed versions and original license
bytes before builds. The real Mac `afterPack` hook repeats input validation and
compares actual `Resources/licenses/third_party/javascript-runtime` files to
the reviewed pins, including the manifest. Existing Electron/CUA/browser
checks continue independently. The normal `third_party` extra-resource copy
retains these records.

Offline disposable tests reject missing and same-size altered license copies,
changed installed package identity/version/license, changed original npm
license bytes, symlinked package records, and edited packaged manifests.
Future dependency changes must update these original records and their reviewed
pin deliberately. Mermaid's emitted/transitive dependency graph and other
JavaScript components, source obligations, fonts and native libraries still
require their own inventory.
