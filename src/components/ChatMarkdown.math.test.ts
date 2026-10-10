// GrokOff addition (2026-10-09): keep math useful while rejecting resource and
// HTML commands, including when a library caller inherits polluted options.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatMarkdown } from "./ChatMarkdown";

const moduleRequire = createRequire(import.meta.url);
const katexConsumers = [
  ["chat's direct dependency", moduleRequire.resolve("katex")],
  ["Markdown plugin", createRequire(moduleRequire.resolve("rehype-katex")).resolve("katex")],
  ["Mermaid", createRequire(moduleRequire.resolve("mermaid")).resolve("katex")],
] as const;

function renderMessage(text: string): string {
  return renderToStaticMarkup(createElement(ChatMarkdown, { text }));
}

// The UMD dependency runs inside its own realm with no DOM, timers, fetch,
// require or process. Pollution never reaches React, Vitest or another test.
// A VM execution deadline also bounds an accidentally unbounded macro loop.
function isolatedKatex(entry: string, expression: string): string {
  const realm = createContext({ module: { exports: {} }, exports: {} });
  runInContext(readFileSync(entry, "utf8"), realm, { timeout: 2_000 });
  return runInContext(expression, realm, { timeout: 2_000 }) as string;
}

describe("chat math after dependency updates", () => {
  it("preserves inline semantics and accessible display math around prose", () => {
    const html = renderMessage("Distance $v t$.\n\n$$\n\\int_0^2 x\\,dx = 2\n$$\n\nAfter the formula.");
    expect(html.match(/class="katex"/g)).toHaveLength(2);
    expect(html.match(/class="katex-display"/g)).toHaveLength(1);
    expect(html.match(/<math\b/g)).toHaveLength(2);
    expect(html).toContain('<mi>v</mi><mi>t</mi>');
    expect(html).toContain('display="block"');
    expect(html).toContain('encoding="application/x-tex"');
    expect(html).toContain('<p dir="ltr">After the formula.</p>');
    expect(html).not.toContain("katex-error");
  });

  it("keeps failed TeX visible and escaped without losing following prose", () => {
    const html = renderMessage('$\\frac{<img src=x onerror="fixture">}$\n\nStill readable.');
    expect(html).toContain('class="katex-error"');
    expect(html).toContain("\\frac");
    expect(html).toContain("&lt;img");
    expect(html).not.toMatch(/<img\b|<script\b|<[^>]*\sonerror=/i);
    expect(html).toContain('<p dir="ltr">Still readable.</p>');
  });

  it.each([
    ["an external image", "\\includegraphics{https://math-resource.invalid/pixel.png}"],
    ["a local image", "\\includegraphics{file:///fixture/private.png}"],
    ["an external link", "\\href{https://math-resource.invalid/}{visit}"],
    ["a script link", "\\href{javascript:fixture()}{visit}"],
    ["a URL command", "\\url{https://math-resource.invalid/}"],
    ["custom HTML styling", "\\htmlStyle{background-image:url(https://math-resource.invalid/pixel.png)}{x}"],
    ["a custom HTML class", "\\htmlClass{grokoff-untrusted-class}{x}"],
    ["custom HTML data", "\\htmlData{grokoff=untrusted}{x}"],
  ])("renders %s as rejected TeX without creating active markup", (_name, tex) => {
    // A math fence exercises rehype-katex directly without the chat's
    // prose/autolink normalization treating a TeX URL as a Markdown URL.
    const html = renderMessage(`Before.\n\n\`\`\`math\n${tex}\n\`\`\`\n\nAfter.`);
    // TeX source in the accessibility annotation is inert. Check generated
    // elements/attributes, not whether that annotation mentions the URL.
    expect(html).toContain('class="katex"');
    expect(html).not.toMatch(/<(?:a|img|script)\b|\s(?:href|src|data-grokoff)=/i);
    expect(html).not.toMatch(/class="[^"]*\bgrokoff-untrusted-class\b/);
    expect(html).not.toMatch(/style="[^"]*background-image/);
    expect(html).toContain('<p dir="ltr">After.</p>');
  });

  it("leaves Mermaid math labels intact on the separate diagram route", () => {
    const html = renderMessage('```mermaid\nflowchart LR\n  A["$$x^2 + y^2$$"] --> B["answer"]\n```\n\nInline $z$.');
    expect(html).toContain('title="Mermaid diagram"');
    expect(html).toContain("$$x^2 + y^2$$");
    expect(html.match(/class="katex"/g)).toHaveLength(1);
    // SSR proves the route/source survives, not Mermaid's later browser SVG.
  });
});

describe.each(katexConsumers)("%s ignores inherited KaTeX options", (_consumer, entry) => {
  it.each(["options prototype", "Object.prototype"] as const)("keeps trust disabled under %s contamination", (contamination) => {
    const html = isolatedKatex(entry, `
      const inherited = { trust: true, output: "html", displayMode: true };
      ${contamination === "Object.prototype" ? "Object.assign(Object.prototype, inherited);" : ""}
      const options = ${contamination === "options prototype" ? "Object.create(inherited)" : "{}"};
      options.throwOnError = false;
      module.exports.renderToString(String.raw\`\\includegraphics{https://math-resource.invalid/pixel.png} + \\href{javascript:fixture()}{visit}\`, options);
    `);
    expect(html).toContain('class="katex"');
    expect(html).toContain("<math");
    expect(html).not.toContain("katex-display");
    expect(html).not.toMatch(/<(?:a|img|script)\b|\s(?:href|src)=/i);
    expect(Object.hasOwn(Object.prototype, "trust")).toBe(false);
    expect(Object.hasOwn(Object.prototype, "output")).toBe(false);
  });

  it("retains the default macro expansion bound despite inherited maxExpand", () => {
    const result = isolatedKatex(entry, `
      Object.prototype.maxExpand = Infinity;
      const options = { macros: { "\\\\grokoffLoop": "\\\\grokoffLoop" }, throwOnError: true };
      try {
        module.exports.renderToString("\\\\grokoffLoop", options);
        "unexpectedly rendered";
      } catch (error) {
        error.name + ": " + error.message;
      }
    `);
    expect(result).toMatch(/ParseError:.*Too many expansions/);
    expect(Object.hasOwn(Object.prototype, "maxExpand")).toBe(false);
  });
});
