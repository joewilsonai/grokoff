# Synthetic browser login continuity

This opt-in check uses the real pinned native browser and Chrome, with the
production profile preparation, restore identity and encryption functions.
It creates a synthetic website on loopback and a disposable home. No provider
account, personal browser profile, macOS keychain or running GrokOff app is used.

Prepare the current platform's bundle, then run:

```sh
node scripts/prepare-browser.mjs --current
node --experimental-strip-types scripts/verify-browser-login.ts \
  --bundle "$PWD/dist-native/browser/$(node -p 'process.platform + "-" + process.arch')"
```

The script verifies the bundle's pinned manifest, executable hashes, complete
file inventory and architecture before executing it. It never downloads a
browser itself. An existing prepared bundle may be passed by absolute path.

The check signs into its synthetic page once. The local server sets a persistent
HttpOnly cookie and confirms that the native browser sends it to a protected
page. The fixture also stores a random localStorage marker. It closes the exact
owned native session, waits for its daemon to disappear, and ends the first
worker process. A fresh worker and native daemon reopen the protected page
without visiting login. Both the authenticated HTTP request and localStorage
marker must survive. A separate guest profile must receive an unauthenticated
response and write no saved state.

The controlled worker-stream regression verifies that a native descendant
holding stdout/stderr cannot block cleanup after its worker exits:

```sh
node --test scripts/testing/browser-worker-streams.node-test.mjs
```

Saved state must be encrypted with a random key stored only in the disposable
data directory. The recipe keeps private receipts and bounded worker logs in
ignored `.local/browser-login-*` directories. Cleanup closes only the fixture's
exact native sessions, waits for workers and daemons to exit, stops the loopback
server and removes its home. If native shutdown cannot be confirmed, the check
fails and retains its scratch directory for diagnosis.

This establishes synthetic native saved-state restoration. It does not prove
real website MFA/session expiry behavior, provider planning, browser-panel
interaction, or the complete packaged-app restart path. Restarting only an MCP
transport or server is insufficient: the persistent daemon can survive either.

The [browser/report recipe](browser-report.md) separately covers the real
conversation/report interface, approval controls and persisted report bytes.
