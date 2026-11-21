# EDHspace extensions

Connect your APIs and build Commander tools for EDHspace with React and TypeScript.
Use the SDK for approved API requests, deck data, and host actions. Use the shared
component library for native card previews, mana symbols, forms, and themes.

| Package                                         | Use it for                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`@edhspace/api`](packages/api/README.md)       | Approved API requests, deck/selection hooks, host actions, and probability helpers |
| [`@edhspace/ui`](packages/ui/README.md)         | Panels, card lists, mana costs, tables, inputs, and actions                        |
| [`@edhspace/devkit`](packages/devkit/README.md) | Local development, manifest validation, and extension builds                       |

## What can you build?

Extensions are React tools that run in workspace panels or sidebars. They can
read an approved deck, display calculations, accept user input, and request
supported host actions.

| Example                         | What it does                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Mana curve and deck composition | Chart mana values, land/spell counts, or card types from the deck's available metadata                   |
| Opening-hand calculator         | Calculate draw probabilities and compare user-entered land counts or target card counts                  |
| Deck-card browser               | Filter and sort the approved deck's cards, then open their native previews                               |
| Selected-card summary           | Show quantities, mana values, and types for the cards the user has selected                              |
| Known-combo checklist           | Match the deck against combo definitions bundled with the extension, without calling an external service |
| Focused sidebar tools           | Provide multiple declared panels for different views of the same approved deck                           |
| API-connected tools             | Query your own service or a public CORS API for card information, prices, combos, or custom analysis     |
| Export and service actions      | Submit user-approved JSON to a declared API, with confirmation for every POST                            |

The [mana-curve extension](extensions/mana-curve/README.md) and
[external card lookup](extensions/card-lookup/README.md) are complete examples.
Deck data includes names, quantities, and available mana/type metadata; it is
not a complete Oracle, rulings, or pricing database. Handle missing metadata
instead of assuming every field is present.

### What is not supported?

The current SDK does not support:

- Adding, removing, tagging, or saving cards in a deck.
- Built-in card search, rules, or pricing services; extensions can query declared external APIs.
- Host-managed OAuth connections, secret-bearing API proxies, or arbitrary request headers.
- Persistent extension storage or editing saved preferences.
- Standalone commands, background jobs, or unattended automation.

Extensions are scoped to the approved deck and selection, and can open only
their own declared panels. They do not receive account credentials, other users'
data, the site router, or the Dockview instance. Global navigation changes,
changes to other tools, networking outside the SDK, and direct browser storage are outside
the [contribution policy](CONTRIBUTING.md).

Check the [capability reference](API.md#host-capabilities) for permissions and
available host methods before choosing a feature.

## Run the example

You need Node.js 22.12 or newer and the npm version declared in `package.json`.
Clone this repository and start the mana-curve calculator:

```sh
git clone https://github.com/EDHspace/extensions.git edhspace-extensions
cd edhspace-extensions
npm ci --ignore-scripts
npm run build
npm run dev -- extensions/mana-curve
```

Open `http://127.0.0.1:5186`. The development workbench provides a sample deck,
card inspection, and a light/dark theme switch. You do not need an EDHspace account.
Stop the workbench with Ctrl+C.

To try an API-connected extension instead:

```sh
npm run dev -- extensions/card-lookup
```

No external API request happens until you choose **Look up card** and approve
the host's dialog.

## Create an extension

Copy `extensions/mana-curve` to `extensions/my-extension`. Keep its package
configuration and assets, then change these fields in the copied `package.json`:

```json
{
    "name": "@edhspace-extension/my-extension",
    "title": "My extension",
    "description": "A short description of what your extension does.",
    "author": "Your name",
    "permissions": ["deck.read", "cards.inspect"],
    "panels": [
        {
            "id": "my-extension",
            "title": "My extension",
            "entry": "src/index.tsx",
            "location": "workspace"
        }
    ],
    "exports": {
        ".": {
            "types": "./dist/index.d.ts",
            "import": "./dist/my-extension.js"
        },
        "./package.json": "./package.json"
    }
}
```

This is an excerpt: retain the other fields from the example, including
`version`, `type`, `apiVersion`, `icon`, and dependencies. The panel ID must match
the exported JavaScript filename. Replace `assets/icon.svg` with your own icon.
Set `repository.directory` to `extensions/my-extension`.
See the [manifest reference](API.md#extension-manifest) for all supported fields.

Replace `src/index.tsx` with a default-exported React component. This panel reads
the active deck and lets users inspect its cards:

```tsx
import { useState } from "react";
import { useActiveDeck, useExtension } from "@edhspace/api/react";
import { CardList, Notice, PanelLayout } from "@edhspace/ui";

export default function MyExtension() {
    const api = useExtension();
    const deck = useActiveDeck();
    const [inspectionError, setInspectionError] = useState<Error>();

    if (deck.error) return <Notice error>{deck.error.message}</Notice>;
    if (deck.loading) return <Notice>Loading deck...</Notice>;
    if (!deck.data) return <Notice>No deck available.</Notice>;

    return (
        <PanelLayout title={deck.data.name}>
            {inspectionError && <Notice error>{inspectionError.message}</Notice>}
            <CardList
                cards={deck.data.cards}
                onInspect={(card) => {
                    setInspectionError(undefined);
                    void api.cards
                        .inspect(card.id)
                        .catch((error: Error) => setInspectionError(error));
                }}
            />
        </PanelLayout>
    );
}
```

Run your extension from the repository root:

```sh
npm run dev -- extensions/my-extension
```

Source changes rebuild automatically; refresh the browser to see the updated
panel. Restart the workbench after changing manifest fields.

## Use the SDK and UI

Import hooks from `@edhspace/api/react`, calculations from `@edhspace/api/math`,
and components from `@edhspace/ui`. The host and workbench provide the SDK context,
styles, and card-preview integration.

Declare only the permissions your extension needs. The example above needs
`deck.read` to load cards and `cards.inspect` to open their previews. Handle
loading, empty data, denied permissions, and rejected actions in your UI.

Not every SDK method is available in every host. Check the
[capability reference](API.md#host-capabilities) before using card search,
deck mutations, storage, preferences, or commands.

## Connect an external API

Add `network.request` to your manifest's permissions and declare each service.
This excerpt matches the working card-lookup example:

```json
{
    "permissions": ["network.request"],
    "network": [
        {
            "id": "scryfall",
            "title": "Scryfall card lookup",
            "url": "https://api.scryfall.com/cards/",
            "methods": ["GET"]
        }
    ]
}
```

Use `api.network.request`, never direct `fetch`:

```ts
const response = await api.network.request({
    endpoint: "scryfall",
    path: "named",
    query: { exact: "Sol Ring" },
});
```

For your own service, declare its HTTPS base URL and allowed GET/POST methods.
Use a relative path, string query values, and an optional JSON body for POST.
Render errors and validate the returned JSON before using it. The complete
[React example](extensions/card-lookup/src/index.tsx) uses shared Field, FilterBar,
Button, Panel, and Notice components.

The user first grants the extension's network permission, then sees the exact
destination and outgoing data before a request. They can remember GET approval
for that API for the current session; every POST still needs confirmation.
Declaring an endpoint is not user consent. Requests omit cookies, credentials,
and referrers, and do not follow redirects.

Services must support browser CORS. Never embed secret API keys in an extension.
Authenticated services need a separately reviewed host integration; this API
does not supply EDHspace credentials or an OAuth connection.

## Bring a dependency

Approved npm libraries are bundled into the extension; users do not install
packages in their browser. Third-party dependencies need maintainer review and
an exact version. The devkit verifies the approved lockfile integrity, installed
file hashes, transitive graph, allowed imports, and license files before building.
See [dependency review](DEPENDENCIES.md) for the submission and verification process.

## Validate and contribute

From the repository root:

```sh
npm run build
npm run typecheck
npm test
npm run check
```

These commands build and validate every extension under `extensions/`, including
strict TypeScript, manifests, imports, and bundle sizes.

Submit a pull request with your extension, its permission requirements, tests,
and phone/desktop screenshots. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the
dependency policy, accessibility requirements, and review checklist.
