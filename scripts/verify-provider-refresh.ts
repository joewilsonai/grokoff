// Real Settings and StoreProvider against synthetic loopback inventory only.
// No harness server, provider processes, credentials or user profile is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { InstanceInfo } from "../src/state/store.tsx";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, ".local", `provider-refresh-${Date.now()}`);
mkdirSync(output, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "grokoff-provider-refresh-"));
for (const directory of ["home", "user-data"]) mkdirSync(join(scratch, directory));
const instances: InstanceInfo[] = [
  {
    instanceId: "claude", driverKind: "claudeAgent", displayName: "Claude", cliDefault: "claude", access: "subscription",
    snapshot: { state: "available", authenticated: true, billing: "subscription", account: { email: "claude@example.test" } },
    models: { default: "claude-sonnet-5-5", options: [] }, authentication: { method: "paste-code", signOut: true },
    claudeAccount: { configDir: "/fixture/claude", signInCommand: "claude auth login", signInShell: "sh", isDefault: true },
  },
  {
    instanceId: "codex", driverKind: "codex", displayName: "Codex", cliDefault: "codex", access: "subscription",
    snapshot: { state: "available", authenticated: true, billing: "subscription", account: { email: "codex@example.test" } },
    models: { default: "gpt-6.1-sol", options: [] }, authentication: { method: "device-code", signOut: true },
  },
];
let mode: "ready" | "failed" | "pending" = "ready";
let revision = 0;
let abortedChecks = 0;
const inventoryStats = { started: 0, failed: 0, pendingClosed: 0 };
const apiRequests: Array<{ method: string; path: string }> = [];
const http = createHttpServer();
let child: ReturnType<typeof spawn> | undefined;
let childExited = false;
let serverClosed = false;
let passed = false;
let cancelled = false;
let killTimer: ReturnType<typeof setTimeout> | undefined;
const stop = () => {
  cancelled = true;
  child?.kill("SIGTERM");
  if (child?.pid && !killTimer) killTimer = setTimeout(() => {
    if (!childExited) child?.kill("SIGKILL");
  }, 3_000);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
let ui: Awaited<ReturnType<typeof createServer>> | undefined;
try {
ui = await createServer({
  configFile: false, root, cacheDir: join(root, ".omb-scratch", "provider-refresh-vite"),
  resolve: { alias: { "@": join(root, "src") } },
  server: {
    middlewareMode: { server: http }, hmr: { server: http },
    watch: { ignored: ["**/.local/**", "**/.omb-scratch/**", "**/dist/**", "**/build/**", "**/release*/**"] },
  },
  plugins: [react(), tailwindcss(), {
    name: "isolated-provider-refresh",
    resolveId(id) { if (id === "virtual:provider-refresh") return `\0${id}`; },
    load(id) {
      if (id === "\0virtual:provider-refresh") return `
        import React from 'react'; import { createRoot } from 'react-dom/client';
        import { StoreProvider } from '/src/state/store.tsx';
        import { EnginesSettings } from '/src/components/EnginesSettings.tsx';
        import { DesktopCapabilitiesProvider } from '/src/components/DesktopCapabilities.tsx';
        import { applySkin } from '/src/lib/skins.ts'; import { setLocale } from '/src/lib/i18n.ts';
        import '/src/styles.css'; setLocale('en'); applySkin('midnight');
        localStorage.setItem('omb-analytics-opt-out', '1');
        performance.setResourceTimingBufferSize(4096);
        const root = createRoot(document.getElementById('root'));
        root.render(React.createElement(StoreProvider, null, React.createElement(DesktopCapabilitiesProvider, null, React.createElement(EnginesSettings))));
        if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());`;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0];
        const json = (body: unknown, status = 200) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
        if (path === "/__fixture/stats" && req.method === "GET") return json(inventoryStats);
        if (path === "/__fixture/mode" && req.method === "POST") {
          let body = "";
          req.on("data", (part) => { body += part; });
          req.on("end", () => {
            const update = JSON.parse(body);
            mode = update.mode;
            if (update.revision !== undefined) revision = update.revision;
            json({ ok: true });
          });
          return;
        }
        if (path?.startsWith("/api/")) {
          apiRequests.push({ method: req.method ?? "GET", path: req.url! });
          if (req.method !== "GET") return json({ error: "No account, provider or installation mutations in this fixture." }, 403);
          if (path === "/api/instances") {
            inventoryStats.started += 1;
            if (mode === "failed") { res.once("finish", () => { inventoryStats.failed += 1; }); return json({ error: "Fixture inventory unavailable" }, 503); }
            if (mode === "pending") { res.once("close", () => { abortedChecks += 1; inventoryStats.pendingClosed += 1; }); return; }
            return json({ instances: instances.map((instance) => revision ? { ...instance, snapshot: { ...instance.snapshot, account: { email: `${instance.instanceId}-new@example.test` } } } : instance) });
          }
          if (path === "/api/events") {
            res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
            res.write(`data: ${JSON.stringify({ kind: "hello", resumed: false, cursor: "fixture:0" })}\n\n`);
            return;
          }
          if (path === "/api/bots") return json({ bots: [], groups: [], sections: [] });
          if (path === "/api/config") return json({});
          if (path === "/api/routines") return json({ routines: [], runs: [] });
          if (path === "/api/webhooks") return json({ webhooks: [] });
          if (path === "/api/live/call") return json({});
          return json({ error: "Fixture route not available" }, 404);
        }
        if (path !== "/__provider-refresh.html") return next();
        void server.transformIndexHtml(req.url!, '<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated provider refresh</title></head><body class="bg-app p-4"><div id="root"></div><script type="module" src="/@id/virtual:provider-refresh"></script></body></html>')
          .then((html) => { res.setHeader("content-type", "text/html"); res.end(html); }).catch(next);
      });
    },
  }],
});
  assert.equal(cancelled, false, "fixture startup cancelled");
  http.on("request", ui.middlewares);
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", () => { http.removeListener("error", reject); resolve(); });
  });
  const address = http.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/__provider-refresh.html`;
  const electron = createRequire(import.meta.url)("electron");
  assert.equal(cancelled, false, "fixture startup cancelled");
  child = spawn(electron, [join(root, "scripts/testing/provider-refresh-desktop.mjs"), url, output, scratch], {
    env: { PATH: process.env.PATH, HOME: join(scratch, "home"), XDG_CONFIG_HOME: join(scratch, "home"), TMPDIR: scratch, TMP: scratch, TEMP: scratch, DISPLAY: process.env.DISPLAY, SystemRoot: process.env.SystemRoot },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const pid = child.pid;
  for (const stream of [child.stdout!, child.stderr!]) stream.on("data", (data) => appendFileSync(join(output, "electron.log"), data));
  const timeout = setTimeout(stop, 120_000);
  const code = await new Promise<number | null>((resolve, reject) => {
    child!.once("error", reject);
    child!.once("close", (code) => { childExited = true; resolve(code); });
  }).finally(() => clearTimeout(timeout));
  assert.equal(code, 0, `Provider refresh fixture failed; inspect ${join(output, "electron.log")}`);
  assert.equal(apiRequests.every((request) => request.method === "GET"), true, "provider/account mutations attempted");
  assert.ok(abortedChecks >= 1, "hung fetch closed after its deadline");
  passed = true;
  const renderer = JSON.parse(readFileSync(join(output, "renderer-receipt.json"), "utf8"));
  writeFileSync(join(output, "receipt.json"), JSON.stringify({ passed, renderer, apiRequests, abortedChecks, inventoryStats, pid, scratch }, null, 2));
} finally {
  if (child?.pid && !childExited) {
    stop();
    await new Promise<void>((resolve) => child!.once("close", () => { childExited = true; resolve(); }));
  }
  const closed = new Promise<void>((resolve) => { http.close(() => { serverClosed = true; resolve(); }); http.closeAllConnections(); });
  try {
    await ui?.close();
  } finally {
    try {
      await closed;
    } finally {
      rmSync(scratch, { recursive: true, force: true });
      clearTimeout(killTimer);
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      const receiptPath = join(output, "receipt.json");
      const receipt = passed ? JSON.parse(readFileSync(receiptPath, "utf8")) : { passed: false, apiRequests, scratch };
      writeFileSync(receiptPath, `${JSON.stringify({ ...receipt, cleanup: { childExited, serverClosed, scratchRemoved: !existsSync(scratch) } }, null, 2)}\n`);
      console.log(JSON.stringify({ passed, receipt: receiptPath }));
    }
  }
}
