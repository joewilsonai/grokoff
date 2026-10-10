# KaTeX attribution

<!-- GrokOff modification (2026-10-10): distinguish package and embedded font notices. -->

GrokOff bundles KaTeX 0.18.2 JavaScript, CSS and its supplied font assets through the production UI build. Chat Markdown, Mermaid's core entry and remark math resolve the same patched package.

- Source: https://github.com/KaTeX/KaTeX/tree/v0.18.2
- Package: https://registry.npmjs.org/katex/0.18.2
- [LICENSE](LICENSE) retains the package's unmodified MIT text, Copyright (c) 2013-2020 Khan Academy and other contributors, for the JavaScript/CSS package attribution.
- The supplied font metadata declares the SIL Open Font License, Version 1.1. [FONT-NOTICES.txt](FONT-NOTICES.txt) preserves the embedded notices verbatim for all 12 families: Copyright (c) 2009-2010 Design Science, Inc. and Copyright (c) 2014-2018 Khan Academy, with each family's Reserved Font Name.
- [OFL-1.1.txt](OFL-1.1.txt) retains the license body from the [official SIL OFL text](https://openfontlicense.org/documents/OFL.txt). It accompanies the per-family copyright and Reserved Font Name notices above.
- [fonts-LICENSE](fonts-LICENSE) preserves the original MIT notice, Copyright (c) 2018 Khan Academy, from the [archived font-project repository](https://github.com/KaTeX/katex-fonts/blob/master/LICENSE). This archived project notice does not replace the OFL declaration embedded in the supplied font files.

The font metadata audit covers the 60 TTF, WOFF and WOFF2 files supplied by KaTeX 0.18.2 across 12 families. Retaining these separate notices does not assert that the font files are offered under a choice of MIT or OFL terms.

The Mac packaging configuration includes this directory under `Resources/licenses/third_party/katex`. Preserve it when distributing a built app. No KaTeX source or fonts are vendored here; package resolution and Vite supply the assets.
