// GrokOff read-only assertion for the actual packaged .app's CUA notices.
import { isAbsolute } from "node:path";
import { verifyMacCuaApp } from "./cua-mac-notices.mjs";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--app" || !isAbsolute(args[1]) || !args[1].endsWith(".app")) {
  console.error("Usage: node scripts/verify-mac-cua-notices.mjs --app /absolute/path/GrokOff.app");
  process.exitCode = 1;
} else {
  try { console.log(JSON.stringify(verifyMacCuaApp(args[1]))); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
