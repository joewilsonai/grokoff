import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const GROKOFF_NAME = "GrokOff";
export const GROKOFF_UPDATES_ENABLED = false;
export const GROKOFF_AUTO_START_HOST_CONTROL = false;

/** Explicit operator configuration only. A fork never inherits a vendor service. */
export function configuredServiceURL(environment, name, legacyName) {
  const value = Object.hasOwn(environment, name) ? environment[name] : environment[legacyName];
  return typeof value === "string" ? value.trim() : "";
}

/** Set before any profile, credential, log or single-instance operation. */
export function configureGrokOffIdentity(app, {
  environment = process.env,
  ensureDirectory = directory => mkdirSync(directory, { recursive: true, mode: 0o700 }),
} = {}) {
  app.setName(GROKOFF_NAME);
  const userData = configuredServiceURL(environment, "GROKOFF_USER_DATA", "OMB_USER_DATA") ||
    join(app.getPath("appData"), GROKOFF_NAME);
  ensureDirectory(userData);
  app.setPath("userData", userData);
  const logs = configuredServiceURL(environment, "GROKOFF_LOGS_DIR", "OMB_LOGS_DIR");
  if (logs) {
    ensureDirectory(logs);
    app.setAppLogsPath(logs);
  } else {
    app.setAppLogsPath();
  }
}
