<!-- SPDX-License-Identifier: Apache-2.0 -->

# Math renderer acceptance

Run from the repository root after installing dependencies:

```sh
node --experimental-strip-types scripts/verify-math-renderer.ts
```

The fixture mounts the real `ChatMarkdown` component, app stylesheet, and KaTeX
stylesheet in a hidden native Electron window. A loopback Vite server serves
only this synthetic page. There is no app server, engine, provider call,
production preload, login, or access to the user's existing data.

It checks inline and alternate TeX delimiters, display equations, matrices,
multiline alignment, invalid TeX fallback, and Mermaid math labels. Both 900px
and 390px layouts must keep the page and message cards inside the viewport;
a deliberately long display equation must scroll inside its message. The
fixture also checks the loaded KaTeX font and stylesheet and confirms that
untrusted `href`, `url`, `includegraphics`, and `htmlClass` commands create no link,
image, or injected class and attempt no outbound request.

Mermaid's native MathML labels must have visible overflow, retain positive
geometry inside their diagram, and create no label scrollbars at either
width. This guards the inherited interaction where the chat formula scrolling
rule applied inside SVG labels, clipping their line boxes and adding a tiny
vertical scrollbar after the equation. Ordinary long message equations must
still scroll locally.

Evidence is kept in ignored `.local/math-renderer-TIMESTAMP/`: two screenshots,
a JSON receipt, the exact child PID, and the Electron log. Inspect the
screenshots before accepting visual quality. The launcher gives Electron a
fresh temporary home and session profile, waits for that exact child to exit,
and removes only its owned temporary directory. Interrupting the launcher
stops that child; it never closes the user's app or deletes a broad temp root.

This verifies the standalone renderer with synthetic content. It does not
prove full conversation persistence, a packaged app, live provider output,
account integration, or every TeX command and diagram type.

## Dependency regression

The upgrade targets [KaTeX GHSA-238p-pmpm-9mq7](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7). Exploitation requires a separate source of prototype pollution or control over the options prototype; no such source was established in GrokOff. The new `ChatMarkdown.math.test.ts` runs synthetic inherited-option cases in disposable VM realms for the direct, rehype-katex, and Mermaid dependency resolutions. Those tests cover the patched library boundary; the native fixture above covers ordinary rendered behavior and resource rejection.

Run the focused portable checks with:

```sh
pnpm exec vitest run src/components/ChatMarkdown.test.ts src/components/ChatMarkdown.renderers.test.ts src/components/ChatMarkdown.math.test.ts
```
