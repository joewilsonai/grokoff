# Publication hygiene

The initial public import uses a curated source snapshot with a fresh public Git identity. Retain the original local history and private research separately. Subsequent contributions preserve the public Git history through branches and pull requests; do not reinitialize or reset the repository for each release. Exclude personal machine paths, local test receipts, account observations, screenshots that expose private context, and generated app bundles. Keep Apache licensing, upstream provenance and third-party notices intact. Review inherited deployment templates before making them actionable; they do not establish a GrokOff hosted service.

The Gitleaks configuration extends all default detectors. Its exceptions require an exact reviewed file path and an exact fixture value, with narrowly scoped exceptions for the 64-character SHA-256 values in the locale provenance map and one exact reviewed hash fragment clipped by scanner file chunking. The fixture exceptions cover redaction tests, local fake-server capabilities, an encryption interoperability vector and the RFC 6455 WebSocket sample nonce. Test directories and production analytics tokens are not excluded. Review new findings individually; do not add blanket file or directory exceptions.

Run both checks from the prepared public repository, with Gitleaks 8.25 or later:

```sh
gitleaks dir --config .gitleaks.toml --redact --no-banner .
gitleaks git --config .gitleaks.toml --redact --no-banner --log-opts="--all" .
```

A clean secret scan does not verify screenshot privacy, Git author metadata, redistribution rights or deployment ownership. Check those separately before publishing. Scanner reports must remain redacted. Configuration semantics follow the [Gitleaks documentation](https://github.com/gitleaks/gitleaks/blob/v8.30.1/README.md#configuration).
