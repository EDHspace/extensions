# Contributing extensions

Contributions become trusted site code. Keep them small, understandable, and
limited to the permissions their feature actually needs.

1. Copy `extensions/mana-curve` to `extensions/<your-name>`. Update its npm name,
   title, author, description, icon, panel ID, exports, and requested permissions.
   Use `src/index.tsx` for the primary default-exported React panel.
2. Use `@edhspace/api/react` for host context, `@edhspace/api/math` for calculations,
   and `@edhspace/ui` for presentation. Never import private EDHspace modules,
   `@edhspace/api/host`, account stores, router internals, or the Dockview instance.
3. Build the official packages, then run the local workbench:
   `npm run dev -- extensions/<your-name>`. It supplies synthetic data and rejects
   capabilities it has not implemented.
4. Run `npm run build`, `npm run typecheck`, `npm test`, and `npm run check`.
   Include focused tests for your algorithms and fixtures for loading, empty,
   denied, revoked, and failed operations.
5. Submit a PR describing behavior, permission rationale, dependencies, and
   phone/desktop screenshots. Maintainers review both source and emitted artifacts.

React, React DOM, and the official API/UI packages are shared host dependencies.
Other runtime libraries require approved exact versions, registry integrity,
installed-file hashes, transitive review, and retained license notices. Request
[dependency review](DEPENDENCIES.md) before adding a library. No install scripts,
remote code, arbitrary dynamic imports, browser storage, networking outside the
SDK, or global DOM access in contributions. Declare external HTTPS endpoints and
methods; explain the outgoing data and handle consent denial and provider errors.
Lint rules and dependency checks are review guardrails, not proof of isolation.

Use strict TypeScript without disabling strict checks. Prefer small pure helpers
and component-local state; avoid top-level side effects. Handle SDK rejection
visibly. A mutation proposal is not a saved change until its receipt is `applied`.
Do not implement your own account, cache, permission, or persistence layer.

Reuse native card-preview anchors, shared mana symbols, theme tokens and UI
spacing. Keep controls at least 44px, preserve keyboard focus, and test phone
widths, 200% text, light/dark themes, and reduced motion. Do not style global
selectors or place overlapping labels on card names or mana costs.

Preferences are read-only and return their manifest defaults. Command entries
can be declared and bundled, but command execution is unavailable. Check the
[capability reference](API.md#host-capabilities) before using an SDK method.

Official packages, capability policy, and the application catalog need
maintainer review. Validation runs locally or through the manually triggered
GitHub workflow; opening a PR does not start Actions. Validation does not install extensions in production or publish npm
packages. Never attach secrets, production accounts, or privileged tokens to
unreviewed PR execution.
