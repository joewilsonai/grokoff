// GrokOff modification (2026-10-08): changed this imported OpenMausBot community file for the independent GrokOff fork.
// GrokOff has no analytics service. Keep the call-site interface so inherited
// UI events stay local and cannot contact the upstream telemetry project.
export function analyticsEnabled(): boolean { return false; }
export type OptAction = "init" | "opt-in" | "opt-out" | "none";
export function optAction(_enabled: boolean, _running: boolean): OptAction { return "none"; }
export function setAnalyticsEnabled(_enabled: boolean): void {}
export function initAnalytics(): Promise<void> { return Promise.resolve(); }
export function track(_event: string, _props?: Record<string, unknown>): void {}
export function identifyEmail(_email: string): void {}
// No email collection gate in this independent local edition.
export function emailGateDone(): boolean { return true; }
export function setEmailGateDone(_status: "submitted" | "skipped"): void {}
