// SPDX-License-Identifier: Apache-2.0
// Synthetic math in the real chat renderer; no app server, provider, or user data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer as createPortReservation } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, ".local", `math-renderer-${Date.now()}`);
const scratch = mkdtempSync(join(tmpdir(), "grokoff-math-renderer-"));
for (const directory of [output, join(scratch, "home"), join(scratch, "user-data")]) mkdirSync(directory, { recursive: true });

const cases = [
  { id: "inline", label: "Inline and alternate delimiters", text: String.raw`Energy $E = mc^2$ and ratio \(\frac{a}{b}\) stay in prose.` },
  { id: "display", label: "Display integral", text: String.raw`\[\int_0^1 x^2\,dx = \frac{1}{3}\]` },
  { id: "matrix", label: "Matrix", text: String.raw`$$
\begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}
$$` },
  { id: "aligned", label: "Multiline equations", text: String.raw`$$
\begin{aligned}a + b &= c \\ x^2 + y^2 &= z^2\end{aligned}
$$` },
  { id: "invalid", label: "Invalid TeX remains contained", text: String.raw`The invalid formula $\frac{1}{$ leaves this sentence readable.` },
  { id: "trust", label: "Untrusted TeX cannot create links or images", text: [
    String.raw`\[\href{javascript:alert(1)}{unsafe}\]`,
    String.raw`\[\url{file:///synthetic-math-probe.txt}\]`,
    String.raw`\[\includegraphics{data:image/png;base64,AAAA}\]`,
    String.raw`\[\htmlClass{injected-class}{content}\]`,
  ].join("\n\n") },
  { id: "mermaid", label: "Mermaid math labels", text: ["```mermaid", "flowchart LR", String.raw`  A["$$x^2$$"] --> B["$$\sqrt{x}$$"]`, "```"].join("\n") },
  { id: "long", label: "Long display scrolls within the message", text: "$$\n" + Array.from({ length: 30 }, (_, index) => `x_{${index + 1}}`).join(" + ") + " = S\n$$" },
];

const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {ChatMarkdown} from '/src/components/ChatMarkdown.tsx';
import {setLocale} from '/src/lib/i18n.ts';
import '/src/styles.css';
import 'katex/dist/katex.min.css';
setLocale('en');
const cases = ${JSON.stringify(cases)};
createRoot(document.getElementById('root')).render(React.createElement('main', {className:'mx-auto flex max-w-3xl flex-col gap-4 p-4 text-ink'},
  React.createElement('h1', {className:'text-xl font-semibold'}, 'Synthetic math renderer fixture'),
  ...cases.map(item => React.createElement('section', {key:item.id, 'data-case':item.id, className:'min-w-0 rounded-lg border border-hairline bg-raised p-3'},
    React.createElement('h2', {className:'mb-2 text-sm font-semibold'}, item.label),
    React.createElement(ChatMarkdown, {text:item.text})))));
`;
const route = "/__math-renderer.html";
const reservation = createPortReservation();
let ui: Awaited<ReturnType<typeof createServer>> | undefined;
let child: ReturnType<typeof spawn> | undefined;
let childClosed = false;
let receipt: { passed: boolean; checks: string[]; cleanup?: { electronExited: boolean; temporaryHomeRemoved: boolean } } | undefined;
try {
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  ui = await createServer({
    configFile: false, root, logLevel: "warn",
    resolve: { alias: { "@": join(root, "src") } },
    define: { __APP_VERSION__: JSON.stringify("math-fixture") },
    server: { host: "127.0.0.1", port, strictPort: true, hmr: { clientPort: port } },
    plugins: [react(), tailwindcss(), {
      name: "isolated-math-renderer",
      resolveId(id) { if (id === "virtual:math-renderer") return `\0${id}`; },
      load(id) { if (id === "\0virtual:math-renderer") return entry; },
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url !== route) return next();
          const page = '<!doctype html><html data-skin="midnight"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated GrokOff math</title></head><body class="bg-app"><div id="root"></div><script type="module" src="/@id/virtual:math-renderer"></script></body></html>';
          void server.transformIndexHtml(route, page).then((html) => {
            response.setHeader("content-type", "text/html"); response.end(html);
          }).catch(next);
        });
      },
    }],
  });

  await ui.listen();
  const base = ui.resolvedUrls?.local[0];
  assert.ok(base, "The isolated preview must have an explicit origin");
  const url = new URL(route, base).href;
  child = spawn(createRequire(import.meta.url)("electron"), [join(root, "scripts/testing/math-desktop.mjs"), url, output, scratch], {
    env: { PATH: "/usr/bin:/bin", HOME: join(scratch, "home"), USERPROFILE: join(scratch, "home"), XDG_CONFIG_HOME: join(scratch, "home"), TMPDIR: scratch, TMP: scratch, TEMP: scratch },
    stdio: ["ignore", "pipe", "pipe"],
  });
  writeFileSync(join(output, "launcher.json"), JSON.stringify({ pid: child.pid, previewUrl: url, scratch }, null, 2) + "\n");
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", (data) => appendFileSync(join(output, "electron.log"), data));
  const owned = child;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (childClosed) return;
    owned.kill("SIGTERM");
    escalation ??= setTimeout(() => { if (!childClosed) owned.kill("SIGKILL"); }, 5_000);
  };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  const timer = setTimeout(stop, 120_000);
  const code = await new Promise<number | null>((resolve, reject) => {
    owned.once("error", reject);
    owned.once("close", (value) => { childClosed = true; resolve(value); });
  }).finally(() => {
    clearTimeout(timer); if (escalation) clearTimeout(escalation);
    process.off("SIGINT", stop); process.off("SIGTERM", stop);
  });
  assert.equal(code, 0, `Math renderer failed; inspect ${join(output, "electron.log")}`);
  receipt = JSON.parse(readFileSync(join(output, "receipt.json"), "utf8"));
  assert.ok(receipt);
  assert.equal(receipt.passed, true);
} finally {
  if (child && !childClosed) {
    child.kill("SIGKILL");
    await new Promise<void>((resolve) => child!.once("close", () => { childClosed = true; resolve(); }));
  }
  if (reservation.listening) await new Promise<void>((resolve) => reservation.close(() => resolve()));
  await ui?.close();
  rmSync(scratch, { recursive: true, force: true });
  if (receipt) {
    receipt.cleanup = { electronExited: childClosed, temporaryHomeRemoved: true };
    writeFileSync(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  }
}
console.log(JSON.stringify({ passed: true, evidence: output, checks: receipt?.checks }));
