# GrokOff source provenance

GrokOff is an independent derivative of the OpenMausBot community edition. It is not affiliated with xAI, Cursor, Anysphere, or OpenMausBot's maintainers.

- Upstream repository: [milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot).
- Imported revision: [`3e9e42b3a05e0b7c4edbaedba2e667b851296e27`](https://github.com/milind-soni/OpenMausBot/tree/3e9e42b3a05e0b7c4edbaedba2e667b851296e27).
- Imported on: 2026-10-08.
- Community source license: Apache-2.0; original [LICENSE](LICENSE), [NOTICE](NOTICE), and third-party attribution retained.
- Excluded at import: `enterprise/`, upstream Git history and `.github/` automation, generated outputs, and installed dependencies. Any GrokOff automation is maintained independently.
- Fork repository: [joewilsonai/grokoff](https://github.com/joewilsonai/grokoff), maintained by Joe Wilson.

## Fork modifications

GrokOff establishes its own desktop identity, GO entry artwork, workspace and companion state namespaces, and managed-browser namespace. It disables inherited hosted defaults, product analytics, and update feeds; closes two sessionless service dispatch routes; and adds subscription-account checks, provider-native model/effort metadata, and structural Codex configuration parsing.

Modified inherited files carry change notices. [MODIFICATIONS.md](MODIFICATIONS.md) lists their paths, including adjacent notices for format-sensitive or binary files. New GrokOff files and imported third-party components retain their own provenance and notices.

The unmodified [upstream README](docs/upstream/OpenMausBot-README.md) and [packaging configuration](docs/upstream/electron-builder.yml) are historical references. Their downloads, hosted plans, service endpoints, release procedures, and commercial terms describe upstream products, not GrokOff. The fork does not publish to their release channels.

Some inherited tooling is retained but has not been adopted for GrokOff publication. The optional `apps/docs/` site still contains upstream website, download, and canonical documentation links. `scripts/verify-linux-package.mjs` and `scripts/build-npm-package.mjs` retain upstream update/package metadata. These are not supported GrokOff release or deployment procedures, and the repository does not claim that every inherited URL has been repointed. The maintained source CI does not publish a docs site, npm package, Linux package, or hosted service.

## Distribution boundaries

No proprietary Grok Bot implementation or model weights were imported. The separately licensed upstream enterprise edition is excluded. Third-party components and provider services remain subject to their own licenses or terms; see [LICENSING.md](LICENSING.md).

The GrokOff GO mark is original vector artwork created for this fork. Some optional upstream mascot source is retained as community code; reserved upstream trademark rights remain a separate review item before branded binary distribution. Copyright attribution is preserved and does not imply endorsement.

This is a Mac source alpha. No public binary release, signing/notarization claim, hosted service, or remote update feed is supplied. See [verification](research/verification.md) and [the roadmap](ROADMAP.md) for demonstrated behavior and planned work.
