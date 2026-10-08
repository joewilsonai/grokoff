import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import localOrigin from "./local-origin.cjs";
import { createSecureCredentialState } from "./secure-credential-state.mjs";
import {
  PHONE_SECRET_CREDENTIAL_KEY,
  createPhoneSecretIdentity,
  phoneSecretPrivateKeyMessage,
  readPhoneSecretIdentity,
  withPhoneSecretIdentity,
} from "./phone-secret-identity.mjs";

// Run the actual narrow main-process seams with an in-memory credential
// writer and inert companion/server. No Electron, OS Keychain, real HOME,
// subprocesses, provider calls, or private files enter these fixtures.
const source = readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
function seam(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing main seam: ${start}`);
  return source.slice(from, to);
}

function fixture({ initial = {}, unavailable = false } = {}) {
  const calls = { creates: 0, writes: [], messages: [], forks: 0, stops: 0, managedStops: 0, managedStarts: 0, remembered: [], pairing: [] };
  let running = false;
  let publicKey = null;
  let failWrite = false;
  let writeDelay = async () => {};
  let managedStopDelay = async () => {};
  let sidecarStopDelay = async () => {};
  const state = () => ({ enabled: running, ...(publicKey ? { secretPublicKey: publicKey } : {}) });
  const context = vm.createContext({
    secureCredentials: structuredClone(initial), secureCredentialState: null,
    credentialStoreUnavailable: unavailable,
    phoneSecretIdentity: null, phoneSecretIdentityPending: null,
    createSecureCredentialState, readPhoneSecretIdentity, withPhoneSecretIdentity, phoneSecretPrivateKeyMessage,
    saveSecureCredentials: async value => {
      await writeDelay();
      if (failWrite) throw new Error("fixture credential store unavailable");
      calls.writes.push(structuredClone(value));
    },
    createPhoneSecretIdentity: async () => { calls.creates++; return createPhoneSecretIdentity(); },
    app: { isPackaged: true }, serverProc: { postMessage: message => calls.messages.push(message) },
    process: { resourcesPath: "/fixture/resources" }, SERVER_PORT: 12345, companionMutationToken: "fixture-token",
    companionDesiredThisLaunch: false, companionLaunchGeneration: 0,
    companionPairingGeneration: 0,
    managedCompanionConnector: { stop: async () => { calls.managedStops++; await managedStopDelay(); } },
    managedRemoteAccessRefusal: () => null,
    startCompanion: async options => {
      if (!running) { running = true; publicKey = options.secretPublicKey; calls.forks++; }
      return state();
    },
    stopCompanion: async () => { running = false; publicKey = null; calls.stops++; await sidecarStopDelay(); },
    companionRunning: () => running,
    companionPairing: async (open, token) => { calls.pairing.push({ open, token, publicKey }); return state(); },
    rememberCompanionEnabled: value => calls.remembered.push(value),
    syncCompanionKeepAwake: () => {},
    startManagedCompanionConnection: async () => { calls.managedStarts++; },
    desktopCompanionState: state, decorateDesktopCompanionState: value => value, slog: () => {},
  });
  context.updateSecureCredentialDocument = async derive => {
    await context.secureCredentialState.update(derive);
    context.secureCredentials = context.secureCredentialState.read();
  };
  const bootStart = source.indexOf("secureCredentialState = createSecureCredentialState", source.indexOf("// Boot migrations above"));
  const bootEnd = source.indexOf("desktopRemoteAccess = desktopCompanionAccess", bootStart);
  assert.ok(bootStart >= 0 && bootEnd > bootStart);
  vm.runInContext(source.slice(bootStart, bootEnd), context);
  vm.runInContext(seam("async function ensurePhoneSecretIdentity()", "function publicManagedCompanionState()"), context);
  vm.runInContext(seam("function syncPhoneSecretKey(proc)", "function ensureCloudAccount()"), context);
  vm.runInContext(seam("function companionLaunchOptions(", "function ensureManagedCompanionConnector()"), context);
  vm.runInContext(seam("async function startDesktopCompanion(", "async function stopDesktopCompanion("), context);
  vm.runInContext(seam("async function stopDesktopCompanion(", "async function refreshDesktopCompanionTailscale("), context);
  const deferred = setDelay => {
    let entered, release;
    const enteredPromise = new Promise(resolve => { entered = resolve; });
    const released = new Promise(resolve => { release = resolve; });
    setDelay(async () => { entered(); await released; });
    return { entered: enteredPromise, release };
  };
  return {
    calls, context, failWrites: value => { failWrite = value; },
    deferWrite: () => deferred(delay => { writeDelay = delay; }),
    deferManagedStop: () => deferred(delay => { managedStopDelay = delay; }),
    deferSidecarStop: () => deferred(delay => { sidecarStopDelay = delay; }),
  };
}

test("fresh boot and automatic companion resume do not create or persist a phone identity", async () => {
  const { calls, context } = fixture();
  assert.equal(context.phoneSecretIdentity, null);
  assert.equal(calls.creates, 0);
  assert.equal(calls.writes.length, 0);
  await context.startDesktopCompanion({ waitForHosted: false, remember: false, initializePhoneSecret: false });
  assert.equal(calls.creates, 0);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.messages.length, 0);
  assert.match(source, /startDesktopCompanion\(\{ waitForHosted: false, remember: false, initializePhoneSecret: false \}\)/);
});

test("explicit companion use persists once and syncs the private half before advertising the public key", async () => {
  const { calls, context } = fixture({ initial: { xaiApiKey: "fixture-kept" } });
  await context.startDesktopCompanion();
  assert.equal(calls.creates, 1);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.writes[0].xaiApiKey, "fixture-kept");
  const identity = readPhoneSecretIdentity(calls.writes[0]);
  assert.ok(identity);
  assert.deepEqual(calls.messages, [phoneSecretPrivateKeyMessage(identity)]);
  assert.equal(context.phoneSecretIdentity.publicKey, identity.publicKey);
  assert.equal(context.desktopCompanionState().secretPublicKey, identity.publicKey);
  assert.equal(calls.forks, 1);
  await context.startDesktopCompanion();
  assert.equal(calls.creates, 1);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.forks, 1);
});

test("a saved identity restores without rotation and concurrent first use coalesces", async () => {
  const identity = await createPhoneSecretIdentity();
  const saved = fixture({ initial: { [PHONE_SECRET_CREDENTIAL_KEY]: identity } });
  assert.deepEqual(saved.context.phoneSecretIdentity, identity);
  await saved.context.startDesktopCompanion({ initializePhoneSecret: false });
  assert.equal(saved.calls.creates, 0);
  assert.equal(saved.calls.writes.length, 0);
  assert.equal(saved.context.desktopCompanionState().secretPublicKey, identity.publicKey);

  const fresh = fixture();
  const [first, second] = await Promise.all([
    fresh.context.ensurePhoneSecretIdentity(), fresh.context.ensurePhoneSecretIdentity(),
  ]);
  assert.deepEqual(first, second);
  assert.equal(fresh.calls.creates, 1);
  assert.equal(fresh.calls.writes.length, 1);
  assert.equal(fresh.calls.messages.length, 1);
});

test("failed reads and failed writes cannot advertise an unpersisted private identity", async () => {
  const unreadable = fixture({ unavailable: true });
  await unreadable.context.startDesktopCompanion();
  assert.equal(unreadable.context.phoneSecretIdentity, null);
  assert.equal(unreadable.calls.creates, 0);
  assert.equal(unreadable.calls.writes.length, 0);
  assert.equal(unreadable.calls.messages.length, 0);
  assert.equal(unreadable.context.desktopCompanionState().secretPublicKey, undefined);

  const locked = fixture();
  locked.failWrites(true);
  await locked.context.startDesktopCompanion();
  assert.equal(locked.context.phoneSecretIdentity, null);
  assert.equal(locked.calls.writes.length, 0);
  assert.equal(locked.calls.messages.length, 0);
  assert.equal(locked.context.desktopCompanionState().secretPublicKey, undefined);
  locked.failWrites(false);
  await locked.context.startDesktopCompanion();
  assert.equal(locked.calls.writes.length, 1);
  assert.equal(locked.calls.messages.length, 1);
  assert.equal(locked.calls.stops, 1);
  assert.equal(locked.calls.forks, 2);
});

test("an explicit local pairing upgrades a keyless resumed sidecar before opening the pairing window", async () => {
  const { calls, context } = fixture();
  await context.startDesktopCompanion({ initializePhoneSecret: false });
  let pair;
  context.ipcMain = { handle: (_channel, handler) => { pair = handler; } };
  context.localOnly = localOrigin.localOnly;
  localOrigin.setLocalOrigin("http://127.0.0.1:49210");
  try {
    vm.runInContext(seam('ipcMain.handle("companion:pairing"', 'ipcMain.handle("companion:cloud-desktop"'), context);
    assert.throws(() => pair({ senderFrame: { url: "https://remote.invalid/" } }, true), /only available/);
    const local = { senderFrame: { url: "http://127.0.0.1:49210/" } };
    await pair(local, false, "fixture-expected-token");
    assert.equal(calls.creates, 0);
    await pair(local, true);
    assert.equal(calls.creates, 1);
    assert.equal(calls.writes.length, 1);
    assert.equal(calls.messages.length, 1);
    assert.equal(calls.stops, 1);
    assert.equal(calls.managedStops, 1);
    assert.equal(calls.forks, 2);
    assert.equal(calls.pairing[0].token, "fixture-expected-token");
    assert.equal(calls.pairing[1].publicKey, context.phoneSecretIdentity.publicKey);
  } finally {
    localOrigin.setLocalOrigin(null);
  }
});

test("Stop during a pending native-store write cancels the start before any sidecar or hosted access", async () => {
  const { calls, context, deferWrite } = fixture();
  const write = deferWrite();
  const starting = context.startDesktopCompanion();
  await write.entered;
  await context.stopDesktopCompanion();
  write.release();
  const result = await starting;
  assert.equal(result.enabled, false);
  assert.equal(context.companionDesiredThisLaunch, false);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.forks, 0);
  assert.equal(calls.managedStarts, 0);
  assert.deepEqual(calls.remembered, [false]);
});

test("Stop during the keyless-sidecar upgrade prevents a stale restart or enablement", async () => {
  const { calls, context, deferManagedStop } = fixture();
  await context.startDesktopCompanion({ remember: false, initializePhoneSecret: false });
  const initialManagedStarts = calls.managedStarts;
  const stop = deferManagedStop();
  const starting = context.startDesktopCompanion();
  await stop.entered;
  const stopping = context.stopDesktopCompanion();
  stop.release();
  await Promise.all([starting, stopping]);
  assert.equal(context.companionDesiredThisLaunch, false);
  assert.equal(context.desktopCompanionState().enabled, false);
  assert.equal(calls.forks, 1);
  assert.equal(calls.stops, 1);
  assert.equal(calls.managedStarts, initialManagedStarts);
  assert.deepEqual(calls.remembered, [false]);
});

test("Close cancels a pairing Open awaiting a native-store write without restarting or stopping the companion", async () => {
  const { calls, context, deferWrite } = fixture();
  await context.startDesktopCompanion({ remember: false, initializePhoneSecret: false });
  let pair;
  context.ipcMain = { handle: (_channel, handler) => { pair = handler; } };
  context.localOnly = localOrigin.localOnly;
  localOrigin.setLocalOrigin("http://127.0.0.1:49210");
  try {
    vm.runInContext(seam('ipcMain.handle("companion:pairing"', 'ipcMain.handle("companion:cloud-desktop"'), context);
    const local = { senderFrame: { url: "http://127.0.0.1:49210/" } };
    const write = deferWrite();
    const opening = pair(local, true);
    await write.entered;
    await pair(local, false, "fixture-close-token");
    write.release();
    await opening;
    assert.equal(calls.writes.length, 1);
    assert.equal(calls.forks, 1);
    assert.equal(calls.stops, 0);
    assert.equal(calls.managedStops, 0);
    assert.deepEqual(calls.pairing.map(call => call.open), [false]);
    assert.equal(context.companionDesiredThisLaunch, true);
    assert.equal(context.desktopCompanionState().enabled, true);
    assert.equal(context.desktopCompanionState().secretPublicKey, undefined);
  } finally {
    localOrigin.setLocalOrigin(null);
  }
});

test("Close during a committed sidecar replacement leaves pairing closed and restores the companion", async () => {
  const { calls, context, deferSidecarStop } = fixture();
  await context.startDesktopCompanion({ remember: false, initializePhoneSecret: false });
  let pair;
  context.ipcMain = { handle: (_channel, handler) => { pair = handler; } };
  context.localOnly = localOrigin.localOnly;
  localOrigin.setLocalOrigin("http://127.0.0.1:49210");
  try {
    vm.runInContext(seam('ipcMain.handle("companion:pairing"', 'ipcMain.handle("companion:cloud-desktop"'), context);
    const local = { senderFrame: { url: "http://127.0.0.1:49210/" } };
    const stop = deferSidecarStop();
    const opening = pair(local, true);
    await stop.entered;
    await pair(local, false);
    stop.release();
    await opening;
    assert.equal(calls.stops, 1);
    assert.equal(calls.forks, 2);
    assert.deepEqual(calls.pairing.map(call => call.open), [false]);
    assert.equal(context.companionDesiredThisLaunch, true);
    assert.equal(context.desktopCompanionState().enabled, true);
  } finally {
    localOrigin.setLocalOrigin(null);
  }
});

test("a Stop waiting for its connector cannot shut down a completed newer Start", async () => {
  const { calls, context, deferManagedStop } = fixture();
  await context.startDesktopCompanion();
  const connector = deferManagedStop();
  const stopping = context.stopDesktopCompanion();
  await connector.entered;
  const restarted = await context.startDesktopCompanion();
  assert.equal(restarted.enabled, true);
  connector.release();
  const stoppedResult = await stopping;
  assert.equal(stoppedResult.enabled, true);
  assert.equal(context.companionDesiredThisLaunch, true);
  assert.equal(context.desktopCompanionState().enabled, true);
  assert.equal(calls.forks, 1);
  assert.equal(calls.stops, 0);
  assert.equal(calls.managedStarts, 2);
  assert.deepEqual(calls.remembered, [true, false, true]);
});
