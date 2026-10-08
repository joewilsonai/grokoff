# Licensing GrokOff

<!-- GrokOff modification (2026-10-08): community-only fork, attribution, trademarks, and runtime/service boundaries. -->

## Community source

GrokOff's community source is distributed under the [Apache License 2.0](LICENSE), preserving the original OpenMausBot copyright and attribution in [NOTICE](NOTICE). Joe Wilson's fork modifications retain that license. [UPSTREAM.md](UPSTREAM.md) identifies the exact imported community revision and excluded material.

The separately licensed upstream `enterprise/` directory is not included. Its license keys, partner agreements, and CLA do not apply to contributions to this community repository. GrokOff does not supply the upstream hosted commercial service.

Contributors must have the right to submit their work under Apache-2.0, or clearly identify any third-party work and its license. No CLA or DCO sign-off is required here. Modified inherited files carry GrokOff change notices; [MODIFICATIONS.md](MODIFICATIONS.md) inventories the fork's modified imported files and adjacent notices.

## Third-party components

Third-party code, data, icons, fonts, and optional runtime binaries keep their own licenses. [NOTICE](NOTICE), [`third_party/`](third_party/), and component-specific notices identify their sources and terms. The root Apache license does not relicense those components. Preserve their notices when redistributing source or a local package; binary redistribution must account for every bundled component, not just the application code.

For example, smol-toml is BSD-3-Clause, models.dev and OpenCode adaptations are MIT, and noVNC is MPL-2.0 with its own accompanying notices. Browser and desktop runtime licensing is documented separately under `third_party/` and in their prepared distributions.

## Names and artwork

GrokOff is independent of xAI, OpenMausBot, Cursor, and their maintainers. Its GO entry mark is original artwork created for this fork. Upstream names retained in attribution, historical documentation, or compatibility code do not imply affiliation.

The upstream licensing notice identifies the OpenMausBot and MausBot names and mascot as trademarks of Supamaus Software Private Limited. Apache-2.0 does not grant trademark rights. That reservation is distinct from the copyright license on community source: no separate artwork copyright exclusion was identified in the pinned community licensing files. Retained optional mascot renderers still require product/trademark review before a branded binary release. Do not present them as GrokOff-owned branding or imply upstream endorsement.

## Providers and downloads

The application's open-source license does not make provider models, subscriptions, APIs, hosted services, or downloaded executables open source. No model weights are included in this repository. Official provider CLIs, optional browser/computer helpers, and operating-system services retain their own terms. Provider limits and any enabled usage charges remain the account owner's responsibility.

The current release scope is public community source. Local packaging is available for development, with no public signed or notarized binary release yet.
