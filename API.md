# Extension API reference

Use this reference for manifest fields, SDK permissions, host integration,
and shared UI behavior. Start with the [README](README.md) to create and run
your first extension.

## Extension manifest

Each extension is an ordinary ESM npm package. The executable specification is
[`extensionPackageSchema`](packages/api/src/manifest.ts); SDK request/result
schemas live in [`contracts.ts`](packages/api/src/contracts.ts).

```json
{
    "name": "@edhspace-extension/mana-curve",
    "version": "0.1.0",
    "type": "module",
    "publishConfig": {
        "access": "public",
        "registry": "https://registry.npmjs.org/"
    },
    "title": "Mana curve & draw calculator",
    "description": "Inspect a curve and calculate draw probabilities.",
    "author": "EDHspace",
    "icon": "assets/icon.svg",
    "apiVersion": 1,
    "permissions": ["deck.read", "cards.inspect"],
    "panels": [
        {
            "id": "mana-curve",
            "title": "Mana curve & draw calculator",
            "entry": "src/index.tsx",
            "location": "workspace"
        }
    ],
    "commands": [],
    "preferences": [
        { "id": "show-cards", "title": "Show card list", "type": "boolean", "default": true }
    ],
    "exports": {
        ".": { "types": "./dist/index.d.ts", "import": "./dist/mana-curve.js" },
        "./package.json": "./package.json"
    },
    "peerDependencies": {
        "@edhspace/api": "^0.1.0",
        "@edhspace/ui": "^0.1.0",
        "react": "^19.0.0"
    }
}
```

Use relative icon/source paths confined to the extension directory. Panels have
unique IDs, titles, TSX entries and preferred `workspace`/`sidebar` locations.
Commands have unique IDs, titles and TS entries, bundled as `command-<id>.js`.
Preferences support text, boolean, finite number and select values; select
defaults must name a declared option. Npm fields such as scripts, files and
license remain ordinary metadata. See the reference package for a complete
buildable manifest.

## Validation and builds

The CLI validates manifests and strict TypeScript, rejects private/undeclared
imports, nonliteral dynamic imports, direct browser globals, escaping paths and
symlinks, and bundles reviewed code using esbuild. React/API/UI imports remain
external in the ESM artifact. It emits declarations and `dist/build.json` with
artifact byte counts, SHA-256 hashes, API version and normalized manifest.
Each emitted file must fit 256 KiB. Retain all generated assets and shared chunks.
Hashes identify build outputs; they are not signatures or automatic trust.

`edhspace check <directory>`, `edhspace build <directory>`, and
`edhspace dev <directory>` serve individual contributors. `check-all` and
`build-all` cover every contribution directory. The manually triggered GitHub
workflow installs without lifecycle scripts, then builds, typechecks, tests and
checks policy using read-only permissions, no secrets and no publication.
Pull requests do not start the workflow. Review changes to policy,
official packages, dependencies and the static catalog separately from extension
feature code.

## Host integration

Host integrations use asynchronous calls with typed request/response envelopes:

```ts
export type ExtensionInvoker = (request: ExtensionRequest) => Promise<ExtensionResponse>;

export type ExtensionArguments = {
    [K in ExtensionMethod]: Extract<ExtensionRequest, { method: K }>["params"];
};

export type ExtensionHandlers = {
    [K in ExtensionMethod]: (
        args: ExtensionArguments[K],
        signal: AbortSignal
    ) => Promise<ExtensionResults[K]>;
};
```

Requests and results are inferred from strict runtime schemas. Envelopes
carry protocol, API version, session UUID and request UUID. Each method selects
its own parameter/result schema and required permission.

The host creates `ExtensionSession(manifest, sessionId, approved, isCurrent,
handlers)`, then `createExtensionClient(request => session.execute(request), ...)`
and renders `ExtensionProvider`. Third-party components receive the client, never
the broker, handlers, workspace object, router, query cache, account token or
Dockview API.

Manifest permissions are requests, not grants. The consent shell belongs to the
host and scopes each client to one owned deck/version and account generation.
Reading a deck returns only its ID, name, format, revision and bounded card DTOs
with IDs, names, quantities, optional mana values/costs/type lines and commander
flags. Private notes, credentials and internal stores are absent. Requests cannot
choose another deck ID.

The broker checks grant/session/resource before and after asynchronous work,
validates all results, rejects replay and caps 8 KiB requests, 256 KiB responses,
four concurrent calls, 30 received calls/minute and 256 remembered IDs per session.
Revocation aborts host operations, rejects pending client calls and unmounts the
contribution. Deck/account changes and workspace restoration never restore grants.
Client timeouts stop waiting, not an already-started host operation. Do not
automatically retry an operation that may already have completed.

## Host capabilities

| SDK surface                                 | Permission                     | EDHspace support                                                                        |
| ------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| `deck.read`, `useActiveDeck`                | `deck.read`                    | One approved owned deck                                                                 |
| `selection.read`, `useSelectedCards`        | `selection.read`               | Selected cards in that deck                                                             |
| `cards.inspect`                             | `cards.inspect`                | Native hover previews/gallery; membership checked                                       |
| `workspace.openPanel`                       | `workspace.open`               | Own declared panels; focus an existing same-deck panel or create a scoped panel/sidebar |
| `notifications.show`                        | `notifications.show`           | Native status/error notice                                                              |
| `preferences.get`                           | `preferences.read`             | Manifest defaults                                                                       |
| `network.request`                           | `network.request`              | Declared HTTPS APIs, explicit request consent, browser CORS                             |
| `deck.propose`, add/remove/tag conveniences | `deck.propose`                 | Unavailable                                                                             |
| `cards.search`, `cards.getByName`           | `cards.search`                 | Unavailable                                                                             |
| `storage.get/set`, `preferences.set`        | Corresponding read/write grant | Unavailable                                                                             |

Unavailable methods reject with an `unavailable` error. Command declarations
can be built, but command execution is unavailable. The local workbench provides
sample deck reads, inspection, and preference defaults, without accounts or persistence.
It also provides the same API-request approval dialog as the native host.

## External requests

Declare `network.request` and a nonempty `network` array together. Each endpoint
has a unique `id`, explanatory `title`, public HTTPS base `url` ending in `/`,
and allowed `methods` (`GET` and/or `POST`). No URL credentials, query/fragment,
IP literals, local names, or nonstandard ports. Up to eight endpoints are allowed.

`api.network.request({ endpoint, path?, method?, query?, body? })` returns
`{ status, data }` for a successful JSON response. Method defaults to GET;
query values are strings and POST may carry JSON. Paths cannot escape the base.
Arbitrary URLs, headers, cookies, redirect options, and GET bodies are rejected.
Validate the returned JSON against the provider's contract.

Hosts install `createNetworkHandler(manifest, { approve })` as the
`"network.request"` handler. `approve(request, signal)` must use host-controlled
UI and return a boolean. `NetworkApprovalQueue` provides stable snapshots,
subscription, FIFO prompts, `answer(id, allowed, remember?)`, and `dispose()`.
Render `ApiRequestDialog` for the first snapshot entry. Each queue belongs to
one capability session; dispose it when revoking or changing that session.
The extension receives neither the queue nor the approval callback.

Install/open-time network grants enable the capability but do not approve data
transfer. The dialog discloses the full destination, query and JSON body.
Remembered GET consent is scoped to that API base URL and session; POST always
prompts. Concurrent queued calls still require their own decision. Revocation
and approval timeout remove pending prompts and abort outstanding requests.

The default transport is browser-only: omitted credentials, no referrer,
no redirects, and no request cache. Services must allow CORS. Limits are
8 KiB per broker request, 128 KiB raw JSON response, five actual requests per second
per API origin across handlers, 60 seconds for approval, and ten seconds for
network/response reads. The network client waits up to 90 seconds; regular SDK
calls retain their ten-second timeout. Provider HTTP, rate-limit, CORS, parse,
size, cancellation, and timeout failures reject visibly; there are no automatic retries.

For a server host, explicitly supply a trusted `fetch` transport. The default
handler refuses server networking. A server transport must independently enforce
DNS/IP and private-address restrictions, redirects, authentication and provider
limits: the manifest alone is not SSRF protection. Host-managed authentication
and secret-bearing proxies are not provided by this SDK.

## SDK use

This example requires `deck.read`, `selection.read`, and `cards.inspect` in
the extension's manifest:

```tsx
import { useState } from "react";
import { useActiveDeck, useSelectedCards, useExtension } from "@edhspace/api/react";
import { CardList, Notice } from "@edhspace/ui";

export default function SelectedCards() {
    const api = useExtension();
    const active = useActiveDeck();
    const selected = useSelectedCards();
    const [actionError, setActionError] = useState<Error>();
    if (active.error || selected.error || actionError)
        return (
            <Notice error>
                {active.error?.message ?? selected.error?.message ?? actionError?.message}
            </Notice>
        );
    if (active.loading || selected.loading) return <Notice>Loading selection...</Notice>;
    return (
        <CardList
            cards={selected.data ?? []}
            onInspect={(card) => {
                setActionError(undefined);
                void api.cards.inspect(card.id).catch((error: Error) => setActionError(error));
            }}
        />
    );
}
```

Render action errors visibly. Hooks refresh when the host's revision or selection
changes. Call `refresh()` for an explicit re-read.

`workspace.openPanel` never registers arbitrary components or opens arbitrary
routes. Registration is a reviewed manifest/catalog operation; runtime calls can
only open/focus that extension's declared contributions. `cards.inspect` is the
supported detail/gallery request, not direct drawer manipulation.

Mutation receipts use `pending`, `applied`, or `dismissed` status. Only `applied`
means saved; it includes a new revision and undo ID. Deck mutations are unavailable
in the EDHspace adapter listed above.

Pure calculations do not require permissions:

```ts
import { drawProbability, manaCurve } from "@edhspace/api/math";
const chance = drawProbability({
    population: 99,
    successes: 38,
    draws: 7,
    atLeast: 2,
});
const curve = manaCurve(deck.cards);
```

Probability uses a validated finite population without replacement, not an
independent-draw approximation. Curve counts quantities, excludes commanders
and land-front cards, includes spell-front MDFCs and retains unknown mana values.

## UI and working reference

`@edhspace/ui` supplies PanelLayout, CardList, CardPreview, ManaCost, StatBadge,
FilterBar, EmptyState, ActionPanel and DataTable, plus Button, Field, Notice and
the host-controlled ApiRequestDialog.
Styles are opt-in, namespaced, token-driven and animation-free. Inputs and actions
have 44px targets and visible focus; fields have associated labels and action
toolbars support arrow/Home/End navigation without replacing normal Tab behavior.
Tables retain semantic headers and scroll locally when needed.

The application injects its existing hover anchor/gallery through
`CardPreviewProvider`, enforcing the inspection grant. Outside EDHspace the
default inspection action stays lightweight; it does not copy account/routing
code or ship a second gallery. ThemeProvider supports standalone usage, while
the native host uses live `--set-*` tokens so theme changes need no reopen.

The complete reference lives at
[`extensions/mana-curve/package.json`](extensions/mana-curve/package.json) and
[`extensions/mana-curve/src/index.tsx`](extensions/mana-curve/src/index.tsx).
It reads the approved deck, plots a semantic curve table, validates editable
draw-model fields, reports exact probability, and opens native card previews.
It includes explicit loading/empty/error/denied states and never edits the deck.
The [card-lookup reference](extensions/card-lookup/README.md) demonstrates
SDK-mediated Scryfall requests and shared UI without reading or exporting a deck.
See [dependency review](DEPENDENCIES.md) for bundled third-party libraries.
