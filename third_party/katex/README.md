# KaTeX attribution

GrokOff bundles KaTeX 0.18.2 JavaScript, CSS and its supplied font assets through the production UI build. Chat Markdown, Mermaid's core entry and remark math resolve the same patched package.

- Source: https://github.com/KaTeX/KaTeX/tree/v0.18.2
- Package: https://registry.npmjs.org/katex/0.18.2
- [LICENSE](LICENSE) is the unmodified license from that installed package.
- [fonts-LICENSE](fonts-LICENSE) preserves the original Khan Academy font-project notice from https://github.com/KaTeX/katex-fonts/blob/master/LICENSE (archived upstream repository).

Both notices are MIT. The Mac packaging configuration includes this directory under `Resources/licenses/third_party/katex`. Preserve it when distributing a built app. No KaTeX source or fonts are vendored here; package resolution and Vite supply the assets.
