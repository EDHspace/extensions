# Dependency review

Extensions can bundle third-party npm libraries after maintainer approval.
The approved versions live in
[`approved-dependencies.ts`](packages/devkit/src/approved-dependencies.ts).
An empty catalog means no third-party runtime library is approved yet.
Extension authors cannot grant approval through their package manifest.

## Request a review

Include the package, exact version, upstream source/release, intended imports,
feature rationale, and alternatives. Provide the registry archive integrity,
lockfile, full transitive inventory, license/notice files, and browser bundle.
Do not submit private source without permission to redistribute it.

Maintainers review:

1. **Ownership and provenance:** compare the registry artifact with its upstream
   release, publisher history, available npm provenance/signatures, and unusual
   release changes. Investigate missing provenance rather than treating an npm
   name or download count as proof of trust.
2. **Source and dependencies:** inspect every resolved runtime dependency,
   install scripts and executable bins, generated/minified code, dynamic loading, network/storage/DOM
   access, and vulnerability advisories. Review the actual archive and bundle,
   not only a repository's source or an audit score.
3. **License and distribution:** confirm that bundling, notices, source-offer
   obligations, and the application's distribution are compatible. Packages
   requiring unresolved licensing decisions are not approved.
4. **Browser behavior:** test supported imports without Node services, check
   bundle size and heavy computations, and exercise failures, cancellation, and
   real feature behavior using synthetic data.

Never attach production tokens or accounts to review execution. Use a separately
isolated review environment for untrusted package execution. Install from the
lockfile with lifecycle scripts disabled; do not run an unreviewed package's
scripts on a normal development machine.

## Record and verify approval

After reviewing an installed archive, obtain its file inventory hash locally:

```sh
node packages/devkit/dist/cli.js inspect-dependency node_modules/<package>
```

This command reads metadata and hashes files; it does not execute the package,
download anything, or approve it. Record its exact version, registry SHA-512
integrity, file SHA-256, allowed import paths, license and notice filenames,
resolved non-framework dependency versions, and public review link in the catalog.
Every transitive package needs its own review entry.

The builder rejects unapproved versions and imports, changed installed files,
lockfile/archive mismatches, unreviewed transitives, package symlinks, install
scripts, executable bins, Node-only imports, and recognizable raw browser networking. It bundles
approved libraries, retains their declared license files in `dist/licenses/`,
and records dependency reviews and artifact hashes in `dist/build.json`.
React, React DOM, and the official SDK/UI stay external and shared with the host.

Pin third-party dependencies exactly, commit the lockfile, and review updates
as new versions. Browser users receive the already-built contribution, not an npm
installer. GitHub validation is manual-only and never installs an extension into
EDHspace or publishes a package.

## Trust limits

These are supply-chain and contribution review gates, not a JavaScript sandbox.
Native extensions share the application runtime. Malicious same-origin code can
bypass cooperative SDK policies; only reviewed source and exact emitted bundles
should be installed. Static scanning and vulnerability audits do not establish
that arbitrary dependencies are safe.
