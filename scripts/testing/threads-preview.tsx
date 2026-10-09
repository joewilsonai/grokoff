// GrokOff modification (2026-10-09): owned UI launcher controls server onboarding; no email-gate suppression.
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import { setAnalyticsEnabled } from "../../src/lib/analytics";
import { applySkin, readSkin } from "../../src/lib/skins";
import "../../src/styles.css";

// This entry point is served only by the disposable verification launcher.
setAnalyticsEnabled(false);
applySkin(readSkin());
createRoot(document.getElementById("root")!).render(<App />);
