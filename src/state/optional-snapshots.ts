import type { ConfigStatus } from "./store";
import type { WebhookAttempt, WebhookIngressStatus, WebhookTrigger } from "@/lib/webhooks";

/** Config/webhook panels are optional at the chat snapshot boundary. */
export const OPTIONAL_SNAPSHOT_TIMEOUT_MS = 30_000;
type OptionalPath = "/api/config" | "/api/webhooks";
const isRecord = (body: unknown): body is Record<string, unknown> => !!body && typeof body === "object" && !Array.isArray(body);
const isIngress = (body: unknown): body is WebhookIngressStatus => isRecord(body) &&
  typeof body.available === "boolean" && typeof body.baseUrl === "string" &&
  (body.error === undefined || typeof body.error === "string");

async function readOptionalSnapshot(path: OptionalPath, lifetime: AbortSignal): Promise<unknown> {
  const deadline = new AbortController();
  const signal = AbortSignal.any([lifetime, deadline.signal]);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  const timer = setTimeout(() => deadline.abort(new Error(`${path} snapshot timed out after 30 seconds`)), OPTIONAL_SNAPSHOT_TIMEOUT_MS);
  try {
    return await Promise.race([
      aborted,
      (async () => {
        signal.throwIfAborted();
        const response = await fetch(path, { headers: { "content-type": "application/json" }, signal });
        signal.throwIfAborted();
        // A failed/aborted decoder must reach the peripheral retry lane,
        // rather than the general command API's empty-object fallback.
        const body: unknown = await response.json();
        signal.throwIfAborted();
        if (!response.ok) throw new Error(isRecord(body) && typeof body.error === "string" ? body.error : `${response.status} ${response.statusText}`);
        return body;
      })(),
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export async function readConfigSnapshot(lifetime: AbortSignal): Promise<ConfigStatus> {
  const body = await readOptionalSnapshot("/api/config", lifetime);
  if (!isRecord(body) || "error" in body) throw new Error("Invalid config snapshot response");
  // Config sections remain server-owned and may be absent on older servers.
  // Validate its object envelope without introducing a new settings schema.
  return body as unknown as ConfigStatus;
}

export async function readWebhookSnapshot(lifetime: AbortSignal): Promise<{
  webhooks: WebhookTrigger[]; attempts: WebhookAttempt[]; ingress: WebhookIngressStatus;
}> {
  const body = await readOptionalSnapshot("/api/webhooks", lifetime);
  if (!isRecord(body) || !Array.isArray(body.webhooks) ||
      (body.attempts !== undefined && !Array.isArray(body.attempts)) ||
      !isIngress(body.ingress)) {
    throw new Error("Invalid webhook snapshot response");
  }
  // Retain the existing compatibility default for omitted attempts; record
  // schemas remain owned by the server, as with the routine snapshot reader.
  return { webhooks: body.webhooks, attempts: body.attempts ?? [], ingress: body.ingress };
}
