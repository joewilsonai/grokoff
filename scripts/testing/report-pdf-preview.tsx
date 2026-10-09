// GrokOff: only verify-report-pdf.mjs serves this synthetic report-reader page.
import { createRoot } from "react-dom/client";
import { ReportFileButton } from "../../src/components/ReportFilePreview";
import { setLocale } from "../../src/lib/i18n";
import "../../src/styles.css";
setLocale("en");
createRoot(document.getElementById("root")!).render(<main className="p-6">
  <p>PRIVATE_OTHER_CHAT_SENTINEL</p>
  <ReportFileButton path="/synthetic/Research.md" name="Research.md" message={{ threadId: "pdf-thread", messageId: "pdf-message" }} />
</main>);
