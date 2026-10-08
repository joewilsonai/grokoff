// GrokOff modification (2026-10-08): independent fork CI coverage.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Step = { uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, unknown> };
type Job = { permissions?: Record<string, string>; steps?: Step[]; env?: Record<string, unknown>; uses?: string; secrets?: string | Record<string, unknown> };
type Workflow = { on: Record<string, unknown>; permissions?: Record<string, string>; env?: Record<string, unknown>; jobs: Record<string, Job> };

const directory = new URL("../.github/workflows/", import.meta.url);
const workflows = readdirSync(directory).filter(name => /\.ya?ml$/.test(name))
  .map(name => ({ name, workflow: parse(readFileSync(new URL(name, directory), "utf8")) as Workflow }));
const ci = workflows.find(({ name }) => name === "ci.yml")!.workflow;
const actions = new Set(["actions/checkout", "actions/setup-node", "pnpm/action-setup"]);

function accessesSecretsContext(value: unknown): boolean {
  if (typeof value === "string") {
    // Inspect original strings so YAML block-scalar newlines survive. Use a
    // conservative expression span: quoted closing braces must not hide a
    // later context reference. This is a review guard, not an expression parser.
    const expression = value.match(/\$\{\{[\s\S]*\}\}/)?.[0];
    return expression !== undefined && /\bsecrets\b/i.test(expression);
  }
  if (Array.isArray(value)) return value.some(accessesSecretsContext);
  if (value !== null && typeof value === "object") return Object.values(value).some(accessesSecretsContext);
  return false;
}

// Check trust boundaries across every workflow, including future additions.
// These assertions protect public fork PRs; they do not duplicate CI's job layout.
function safetyViolations(workflow: Workflow): string[] {
  const violations: string[] = [];
  const triggers = Object.keys(workflow.on);
  for (const trigger of triggers) if (!["pull_request", "push", "workflow_dispatch"].includes(trigger)) violations.push("privileged trigger: " + trigger);
  const permissions = [workflow.permissions, ...Object.values(workflow.jobs).map(job => job.permissions)].filter(value => value !== undefined);
  if (!workflow.permissions) violations.push("missing explicit workflow permissions");
  for (const scopes of permissions) {
    for (const [scope, level] of Object.entries(scopes!)) {
      if (level !== "none" && !(scope === "contents" && level === "read")) violations.push("unexpected permission: " + scope + ":" + level);
    }
  }
  if (accessesSecretsContext(workflow)) violations.push("workflow accesses secrets");
  for (const job of Object.values(workflow.jobs)) {
    if (job.uses !== undefined) violations.push("workflow calls a reusable workflow");
    if (job.secrets !== undefined) violations.push("workflow passes secrets to a job");
    for (const step of job.steps ?? []) {
      if (step.uses) {
        const [action, revision] = step.uses.split("@");
        if (!actions.has(action) || !/^[a-f0-9]{40}$/.test(revision ?? "")) violations.push("unreviewed action: " + step.uses);
        if (action === "actions/checkout" && step.with?.["persist-credentials"] !== false) violations.push("checkout persists credentials");
      }
      if (step.run && /\b(?:deploy|publish|release:create|broker:deploy)\b|\bgh\s+release\b|\bgit\s+push\b/.test(step.run)) violations.push("workflow publishes or deploys");
    }
  }
  return violations;
}

describe("public fork CI trust boundary", () => {
  it("checks source without privileged events, credentials, publishing or mutable actions", () => {
    expect(workflows.length).toBeGreaterThan(0);
    for (const { name, workflow } of workflows) expect(safetyViolations(workflow), name).toEqual([]);
  });

  it("detects an unsafe future workflow instead of only checking today's YAML", () => {
    const unsafe: Workflow = {
      on: { pull_request_target: null },
      permissions: { contents: "write", "id-token": "write" },
      jobs: { release: { steps: [
        { uses: "actions/checkout@main", with: { "persist-credentials": true } },
        { run: "wrangler deploy", env: { TOKEN: "$" + "{{ secrets.CLOUDFLARE_API_TOKEN }}" } },
      ] } },
    };
    expect(safetyViolations(unsafe)).toEqual(expect.arrayContaining([
      "privileged trigger: pull_request_target", "unexpected permission: contents:write",
      "unexpected permission: id-token:write", "workflow accesses secrets",
      "unreviewed action: actions/checkout@main", "checkout persists credentials", "workflow publishes or deploys",
    ]));
    expect(safetyViolations({ ...unsafe, on: { workflow_run: null } })).toContain("privileged trigger: workflow_run");
  });

  it("keeps every PR check collectable without excluded upstream workflows", () => {
    expect(ci.on).toHaveProperty("pull_request");
    const commands = Object.values(ci.jobs).flatMap(job => (job.steps ?? []).map(step => step.run ?? ""));
    expect(commands).toEqual(expect.arrayContaining(["pnpm install --frozen-lockfile", "pnpm build", "pnpm test:core", "pnpm test:packaged-server"]));
    const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };
    expect(scripts["test:core"]).toContain("scripts/ci-workflow.test.ts");
    expect(scripts["test:core"]).not.toMatch(/docker-image|verification-docs|enterprise\/|ci-stop-closed|release\.yml/);
    expect(scripts.test).toBe("pnpm test:core && pnpm test:packaged-server");
  });

  it.each([
    "${{ secrets.PRIVATE_TOKEN }}",
    "${{ secrets['PRIVATE_TOKEN'] }}",
    "${{ secrets [ 'PRIVATE_TOKEN' ] }}",
    "${{ toJSON(secrets) }}",
    "${{ SECRETS.PRIVATE_TOKEN }}",
    "${{ secrets\n.PRIVATE_TOKEN }}",
    "${{\n secrets\n['PRIVATE_TOKEN']\n}}",
    "${{ format('}}', secrets.PRIVATE_TOKEN) }}",
  ])("rejects secret access independently of other violations: %s", token => {
    const workflow: Workflow = {
      on: { pull_request: null }, permissions: { contents: "read" },
      jobs: { checks: { steps: [{ run: "pnpm lint", env: { TOKEN: token } }] } },
    };
    expect(safetyViolations(workflow)).toEqual(["workflow accesses secrets"]);
  });

  it("allows ordinary text mentioning secrets and unrelated expressions", () => {
    const workflow: Workflow = {
      on: { pull_request: null }, permissions: { contents: "read" },
      jobs: { checks: { steps: [{ run: "pnpm lint", env: { NOTE: "Never print secrets", BRANCH: "${{ github.ref }}" } }] } },
    };
    expect(safetyViolations(workflow)).toEqual([]);
  });

  it("rejects external reusable workflows and secret inheritance without step-based violations", () => {
    const workflow: Workflow = {
      on: { pull_request: null }, permissions: { contents: "read" },
      jobs: { checks: { uses: "someone/unreviewed/.github/workflows/build.yml@main", secrets: "inherit" } },
    };
    expect(safetyViolations(workflow)).toEqual([
      "workflow calls a reusable workflow", "workflow passes secrets to a job",
    ]);
  });

  it("also rejects reusable workflows without inherited secrets", () => {
    const workflow: Workflow = {
      on: { pull_request: null }, permissions: { contents: "read" },
      jobs: { checks: { uses: "./.github/workflows/helper.yml" } },
    };
    expect(safetyViolations(workflow)).toEqual(["workflow calls a reusable workflow"]);
  });
});
