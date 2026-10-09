// GrokOff (2026-10-09): snapshot only the committed report article. The main
// process independently validates this inert tree before creating print HTML.
import { useEffect, useRef, useState } from "react";

export function snapshotReportArticle(article: HTMLElement): ReportPdfNode {
  let nodes = 0;
  function visit(element: Element, depth: number): ReportPdfNode {
    if (++nodes > 50_000 || depth > 64) throw new Error("pdf-size");
    const node: ReportPdfNode = { tag: element.tagName.toLowerCase(), children: [] };
    const dir = element.getAttribute("dir");
    if (dir === "auto" || dir === "ltr" || dir === "rtl") node.dir = dir;
    if (node.tag === "a") node.href = element.getAttribute("href") ?? "";
    if (node.tag === "ol" && element.hasAttribute("start")) node.start = Number(element.getAttribute("start"));
    if (node.tag === "input") node.checked = (element as HTMLInputElement).checked;
    for (const child of element.childNodes) {
      if (child.nodeType === 3) {
        if (++nodes > 50_000) throw new Error("pdf-size");
        node.children.push(child.textContent ?? "");
      }
      else if (child.nodeType === 1) node.children.push(visit(child as Element, depth + 1));
    }
    return node;
  }
  if (article.tagName !== "ARTICLE") throw new Error("pdf-invalid");
  return visit(article, 0);
}

/** One owned job per reader; closing/replacing the report cancels its exact
 * request and late replies cannot change a newer reader's status. */
export function useReportPdf(identity: string) {
  const desktop = typeof window === "undefined" ? undefined : window.ogb;
  const available = typeof desktop?.exportReportPdf === "function" && typeof desktop.cancelReportPdf === "function";
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [reason, setReason] = useState("");
  const active = useRef<{ id: string; cancel: (id: string) => Promise<boolean> } | null>(null);
  useEffect(() => {
    setState("idle");
    setReason("");
    return () => {
      const job = active.current;
      active.current = null;
      if (job) void job.cancel(job.id).catch(() => {});
    };
  }, [identity]);
  async function save(article: HTMLElement | null, name: string) {
    if (!available || active.current || !desktop?.exportReportPdf || !desktop.cancelReportPdf) return;
    const job = { id: crypto.randomUUID(), cancel: desktop.cancelReportPdf };
    active.current = job;
    setState("saving");
    setReason("");
    try {
      if (!article) throw new Error("pdf-invalid");
      const result = await desktop.exportReportPdf({ id: job.id, name, content: snapshotReportArticle(article) });
      if (active.current === job) setState(result === "saved" ? "saved" : "idle");
    } catch (error) {
      if (active.current === job) {
        const code = error instanceof Error ? error.message : "";
        setReason(["pdf-size", "pdf-timeout", "pdf-destination", "pdf-filesystem", "pdf-busy"].includes(code) ? code : "pdf-failed");
        setState("failed");
      }
    } finally {
      if (active.current === job) active.current = null;
    }
  }
  return { available, state, reason, save };
}
