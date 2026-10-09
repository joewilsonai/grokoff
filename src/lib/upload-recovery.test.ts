// GrokOff: bounded attachment failure/recovery with synthetic transport only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileAttachmentFromFile, imageAttachmentFromFile, UPLOAD_ATTEMPT_TIMEOUT_MS } from "./composer-attachments";

const timeoutCopy = "Upload timed out. Check your connection and attach the file again.";
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const cases = [
  { name: "document", file: () => new File(["synthetic"], "Brief.pdf", { type: "application/pdf" }), upload: fileAttachmentFromFile,
    payload: { path: "/private/attachments/11111111-1111-4111-8111-111111111111.pdf", name: "Brief.pdf", bytes: 9 } },
  { name: "image", file: () => new File(["synthetic"], "Shot.png", { type: "image/png" }), upload: imageAttachmentFromFile,
    payload: { path: "/private/attachments/11111111-1111-4111-8111-111111111111.png", mime: "image/png", bytes: 9 } },
];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

for (const fixture of cases) {
  describe(`${fixture.name} upload deadline`, () => {
    for (const phase of ["transport", "body"] as const) {
      it(`aborts a held ${phase}, retries the same ID and accepts a successful replacement`, async () => {
        const held = deferred<Response>();
        const body = deferred<unknown>();
        const signals: AbortSignal[] = [];
        const fetch = vi.fn(async (_url: string, init: RequestInit) => {
          signals.push(init.signal as AbortSignal);
          if (signals.length > 1) return new Response(JSON.stringify(fixture.payload));
          return phase === "transport" ? held.promise : { status: 200, ok: true, json: () => body.promise } as Response;
        });
        vi.stubGlobal("fetch", fetch);
        const result = fixture.upload(fixture.file());
        await flush();
        await vi.advanceTimersByTimeAsync(UPLOAD_ATTEMPT_TIMEOUT_MS);
        await expect(result).resolves.toMatchObject({ path: fixture.payload.path });
        expect(signals[0]!.aborted).toBe(true);
        expect(signals[1]!.aborted).toBe(false);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls[0]![0]).toBe(fetch.mock.calls[1]![0]);
        expect(vi.getTimerCount()).toBe(0);
        // A transport ignoring abort can still resolve late; its result must
        // not replace the successfully recovered attachment.
        held.resolve(new Response(JSON.stringify({ ...fixture.payload, path: "/late" })));
        body.resolve({ ...fixture.payload, path: "/late" });
        await flush();
        await expect(result).resolves.toMatchObject({ path: fixture.payload.path });
      });

      it(`settles repeated held ${phase} failures and clears both deadlines`, async () => {
        const signals: AbortSignal[] = [];
        vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
          signals.push(init.signal as AbortSignal);
          return phase === "transport" ? new Promise<Response>(() => {}) :
            { status: 200, ok: true, json: () => new Promise(() => {}) } as Response;
        }));
        const result = fixture.upload(fixture.file()).catch((error: Error) => error);
        await flush();
        await vi.advanceTimersByTimeAsync(2 * UPLOAD_ATTEMPT_TIMEOUT_MS);
        expect(await result).toMatchObject({ name: "UploadTimeoutError", message: timeoutCopy });
        expect(signals).toHaveLength(2);
        expect(signals.every(signal => signal.aborted)).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
      });
    }

    it.each([304, 401, 403, 413])("does not replay a settled %i refusal", async (status) => {
      const fetch = vi.fn(async () => ({ status, ok: false, json: async () => ({ error: "Fixture refused this upload" }) } as Response));
      vi.stubGlobal("fetch", fetch);
      await expect(fixture.upload(fixture.file())).rejects.toMatchObject({ status, message: "Fixture refused this upload" });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([304, 401, 403, 413])("does not replay a %i refusal whose body stalls", async (status) => {
      const fetch = vi.fn(async () => ({ status, ok: false, json: () => new Promise(() => {}) } as Response));
      vi.stubGlobal("fetch", fetch);
      const result = fixture.upload(fixture.file()).catch((error: Error) => error);
      await vi.advanceTimersByTimeAsync(UPLOAD_ATTEMPT_TIMEOUT_MS);
      expect(await result).toMatchObject({ status, name: "UploadTimeoutError", message: timeoutCopy });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
}
