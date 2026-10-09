# Observed Mac Node runtime components

The Cua 0.28.2 arm64 `cua_driver_node_runtime.node` with SHA-256
`ce442b971f7f47ee796c4a47ceea89fd3999839e8018466c5ac33a683370f810`
contains Rust source path markers for the three crate versions below. Their
exact primary license texts accompany this record, including both MIT notices
in napi's upstream LICENSE. GrokOff has not modified these license texts.

| Observed crate | Declared license | Included primary texts |
| --- | --- | --- |
| libffi 5.2.0 | MIT OR Apache-2.0 | [MIT](licenses/libffi-5.2.0/LICENSE-MIT), [Apache-2.0](licenses/libffi-5.2.0/LICENSE-APACHE) |
| napi 2.16.17 | MIT | [LICENSE](licenses/napi-2.16.17/LICENSE) |
| dlopen2 0.7.0 | MIT | [LICENSE](licenses/dlopen2-0.7.0/LICENSE) |

[manifest.json](manifest.json) records each observed path marker, artifact
digest, versioned crates.io source archive URL and SHA-256, source commit/path
from the archive's `.cargo_vcs_info.json`, and primary license URL/hash at that
commit. The source archive hashes were checked against crates.io's published
checksums. License files were retrieved from those exact primary source commits
and preserved byte-for-byte. The source routes are:

- [libffi-rs at 8309adab3629990d06da20f3da656faf95b23100](https://github.com/libffi-rs/libffi-rs/tree/8309adab3629990d06da20f3da656faf95b23100/libffi-rs).
- [napi at f2178312d0e3e07beecc19836b91716a229107d3](https://github.com/napi-rs/napi-rs/tree/f2178312d0e3e07beecc19836b91716a229107d3/crates/napi).
- [dlopen2 at 617ed96425729a5a10f8e55ece8d1570acd6353a](https://github.com/OpenByteDev/dlopen2/tree/617ed96425729a5a10f8e55ece8d1570acd6353a/dlopen2).

This is a notice inventory for observed source markers. Markers do not prove
an exhaustive binary dependency graph, features, build provenance or a complete
SBOM. The observation above is for the arm64 artifact; the shared notice bundle
also accompanies Mac x64 preparation without claiming that its binary was
independently inspected. Existing Cua and UBRN source/license pins remain intact.

Cua's separate custom N-API builder copies the UBRN source into a temporary
directory and runs Cargo without a preserved lock or `--locked`. The Cua Rust
workspace lock contains an all-platform, development/tooling-inclusive graph;
its 614 entries cannot be assigned to this Node binary. The exact `libffi-sys`
and vendored C libffi versions remain unresolved and are not assigned by this
record. A newly resolved lock would describe a new build, not establish the
published artifact's graph.

The complete Mac CLI/SDK/N-API SBOM remains pending. Build materials, exact
resolved target/features/locks and toolchain evidence must be bound to the
distributed artifact digest before claiming that coverage.
