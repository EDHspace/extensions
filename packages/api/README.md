# @edhspace/api

Typed SDK for EDHspace extensions. React is an optional peer.

```tsx
import { useActiveDeck, useExtension } from "@edhspace/api/react";
import { drawProbability } from "@edhspace/api/math";
```

`useActiveDeck()` and `useSelectedCards()` return `{ data, loading, error, refresh }`.
`useExtension()` returns the host-scoped client. Mount inside the host's
`ExtensionProvider`; handle read errors and individual action rejections visibly.

The client groups approved external API requests, deck reads/mutation proposals, selection, card inspection and
lookup, declared workspace panels, notifications, JSON storage and preferences.
Each method maps to a permission and strict request/result schema. Mutation
conveniences require a prior deck read; applied receipts require revision/undo
and advance the client's revision. Method availability depends on the host;
check the capability reference before using an action.

`@edhspace/api/host` is **host-only**: ExtensionSession binds grants to a current
resource/account generation, validates DTOs and enforces size, replay, rate and
concurrency limits. Disposal/revocation rejects pending calls. Do not expose the
workspace runtime, account stores or handler map to extension components.

For external APIs, declare `network.request` and HTTPS endpoints, then call
`api.network.request({ endpoint, path, query })`. Hosts use `createNetworkHandler`
and `NetworkApprovalQueue` from the host entrypoint to require visible consent.
GET consent can last for one session; POST always prompts. Calls omit credentials
and reject redirects. Public services must support browser CORS.

See the [API reference](../../API.md) for manifest fields, interfaces and
available host capabilities. Unsupported host methods reject explicitly.

From this package: `npm run build`, `npm run typecheck`, `npm test`.
ESM/CommonJS and declarations include shared chunks; retain them when packing.
`npm pack --dry-run` inspects distribution without publishing.
