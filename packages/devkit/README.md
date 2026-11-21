# @edhspace/devkit

Local CLI for reviewed EDHspace extensions. Requires Node 22.12+.

```sh
edhspace check extensions/my-extension
edhspace build extensions/my-extension
edhspace dev extensions/my-extension
edhspace check-all extensions
edhspace build-all extensions
edhspace inspect-dependency node_modules/<package>
```

Check validates package manifests, strict TypeScript and dependency/import policy.
Build additionally rejects escaped/symlinked imports, emits externalized ESM and
declarations, enforces 256 KiB per artifact, and records hashes in `dist/build.json`.
All commands fail explicitly on policy violations. They do not publish or install.
Third-party libraries require reviewed exact versions, matching registry lock
integrity and installed file hashes, transitive approval, and retained licenses.
The inspection command reads files without executing or approving the package.
See [dependency review](../../DEPENDENCIES.md).

Dev bundles a native React workbench at `127.0.0.1:5186` with synthetic deck data,
mock inspection and a light/dark switch. It has no account connection or production
storage. API requests use the host's consent dialog before any outgoing data is
sent. Unsupported capabilities reject. Stop with Ctrl+C; generated workbench
assets stay in `.local/dev`, separate from distributable `dist`.

The policy catches common violations, not malicious JavaScript in general.
Contributions require source/artifact review before native application inclusion.
See the [API reference](../../API.md) and [contribution guide](../../CONTRIBUTING.md).
