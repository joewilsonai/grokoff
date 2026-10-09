# Mac CUA source and notices

GrokOff's Mac development package includes Cua Driver and SDK **0.28.2**, its
modified Node runtime, and JavaScript from `@ubjs/core` and `@ubjs/node`
**0.31.0-3**. They retain their component licenses. This notice inventory does
not establish a complete Mac native SBOM or binary release acceptance.

The separate `../cua-driver` inventory describes an older Linux 0.19.3 build.
Its package counts and source list do not describe this Mac SDK/runtime.

## Exact source routes

| Component | License | Corresponding source |
|---|---|---|
| Cua Driver/SDK 0.28.2 | MIT, with separately licensed dependencies | [Cua commit fc188250b4ca8549b8e61f937fdb1fb560770e86](https://github.com/trycua/cua/tree/fc188250b4ca8549b8e61f937fdb1fb560770e86), release tag `cua-driver-rs-v0.28.2` |
| `@ubjs/core@0.31.0-3` | MPL-2.0 | [Preferred TypeScript source at 49bc59194d183a05855ed4104c18eb92fb465e02](https://github.com/jhugman/uniffi-bindgen-react-native/tree/49bc59194d183a05855ed4104c18eb92fb465e02/typescript/src); [versioned source package](https://registry.npmjs.org/@ubjs/core/-/core-0.31.0-3.tgz) |
| `@ubjs/node@0.31.0-3` resolver/loader | MPL-2.0 | [Source at dcb5c4ab2350d57f6d26f5fa81a99c77ed86d449](https://github.com/jhugman/uniffi-bindgen-react-native/tree/dcb5c4ab2350d57f6d26f5fa81a99c77ed86d449/runtimes/napi); [versioned package](https://registry.npmjs.org/@ubjs/node/-/node-0.31.0-3.tgz). GrokOff's modified preferred resolver source is included as [source/ubjs-node-resolve-lib.ts](source/ubjs-node-resolve-lib.ts). |
| Custom `cua_driver_node_runtime.node` | MPL-2.0 | [UBRN 0.31.0-3 development source](https://registry.npmjs.org/uniffi-bindgen-react-native/-/uniffi-bindgen-react-native-0.31.0-3.tgz), its `runtimes/core` and `runtimes/napi` directories, plus the exact Cua transformations included in [source/build-node-runtime.mjs](source/build-node-runtime.mjs) |

The core package's published source commit differs from the node/development
package's source commit. Their npm integrity values and the Cua release/source
pins appear in [manifest.json](manifest.json). The source archives are available
from the immutable versioned URLs above; the included source transformations
describe the modifications in the shipped code. Covered source files and their
modifications remain under MPL-2.0.

## Running the retained runtime build script

GrokOff's retained script accepts the complete extracted or installed
`uniffi-bindgen-react-native@0.31.0-3` development package explicitly; it does
not require an absent Cua TypeScript project beside this source record. Verify
the downloaded archive against `archiveSha256` in `manifest.json`, extract it,
and provide the resulting package directory:

```sh
node third_party/cua-macos/source/build-node-runtime.mjs \
  --source-root /path/to/extracted/package \
  --output /path/to/cua_driver_node_runtime.node
```

Rust/Cargo and the target toolchain must already be available. Optional
`--target <triple>` selects a cross-compilation target. The script checks the
package name/version and required runtime directories, copies and transforms
only temporary source, then invokes Cargo. It neither installs dependencies
nor establishes a reproducible build or complete native SBOM; Cargo can fetch
its dependencies during an actual build.

## Changes included in the shipped code

Cua modifies the N-API runtime's RustBuffer allocation/free and return paths
for Electron's JavaScript-owned buffers. Its build script changes
`runtimes/napi/src/register/mod.rs` and `runtimes/napi/src/call/mod.rs`; use the
pinned development source with the included build script. The original
[node-runtime-NOTICE.md](node-runtime-NOTICE.md) accompanies the `.node` file.

GrokOff adds the `OPENMAUSBOT_CUA_SDK_LIBRARY` override to the bundled
`@ubjs/node` resolver. Both the modified preferred TypeScript source and the
exact transformation used during preparation are included in
[`source/`](source/). The TypeScript source retains its upstream MPL notice;
[grokoff-resolver-patch.mjs](source/grokoff-resolver-patch.mjs) is also MPL-2.0.
The remainder of the Cua SDK retains its own license.

[Cua-MIT-LICENSE.txt](Cua-MIT-LICENSE.txt) preserves Cua's copyright and MIT
license. [UBRN-SOURCE-NOTICE.txt](UBRN-SOURCE-NOTICE.txt) preserves UBRN's source
notice, and [MPL-2.0-LICENSE.txt](MPL-2.0-LICENSE.txt) supplies the complete MPL
text from the pinned SPDX license-data source recorded in the manifest.

## Verification and remaining inventory

Preparation rejects changed package versions, licenses, runtime notice bytes,
or source-record content. It copies the pinned runtime notice beside the `.node`
and places a component/source notice in `cua-sdk.mjs`. The Mac after-pack gate
checks the actual packaged resources, including the exact source and license
record; it does not execute the application or native helper.

The complete Mac native SBOM remains pending: target-specific CLI/SDK Rust
dependencies, the standalone custom N-API dependency graph and its build-lock
provenance, embedded assets, and native library notices. Cua's custom N-API
builder does not use `cargo --locked`; its deterministic source changes alone
do not establish a reproducible transitive build or binary. Existing Linux
records cannot substitute for that work. Mac signing/notarization and clean
installation acceptance also remain separate release checks.
