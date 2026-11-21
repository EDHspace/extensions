# @edhspace/ui

Lightweight React 19 components for panels, card lists, mana symbols, and forms.
Use them with the EDHspace SDK or in a standalone React application.

```tsx
import { CardList, PanelLayout, Notice } from "@edhspace/ui";
import "@edhspace/ui/styles.css";

<PanelLayout title={deck.name}>
    {error && <Notice error>{error.message}</Notice>}
    <CardList cards={deck.cards} onInspect={inspectCard} />
</PanelLayout>;
```

Exports include PanelLayout/Panel, CardList, CardPreview, ManaCost, SymbolText,
StatBadge, FilterBar, EmptyState, ActionPanel, DataTable, Button, Field, Notice
and ActionBar, plus the host-controlled ApiRequestDialog. The host injects shared hover anchors/native galleries through
CardPreviewProvider; standalone consumers get an explicit inspection button.
Presentation never grants access or performs privileged actions itself.

ApiRequestDialog displays the requesting extension, destination, method and
outgoing data. Its host supplies `onAccept(remember)` and `onCancel`; GET offers
session consent, while POST has no remember option. Native dialog behavior keeps
focus inside, focuses Cancel initially, and supports Escape. The component does
not make requests or grant permissions.

Styles are opt-in and namespaced. Native usage inherits live `--set-*` tokens;
standalone ThemeProvider accepts background, foreground, muted, accent, border
and font. No theme reopen or animation is required. Mana images use
`https://svgs.scryfall.io`; hosting CSP must permit that image origin.

Controls have 44px targets, visible focus, wrapper-based gaps and wrapping.
Fields associate labels with inputs; Notice announces status/errors.
ActionPanel supports arrow/Home/End navigation across enabled buttons while
preserving Tab. DataTable retains semantic headers and local horizontal scrolling.

## Source layout

Keep one React component per file in `src/components/`, including providers and
internal symbol rendering. Shared React contexts belong in `src/contexts/`;
shared data types belong in `src/types/`. Components import siblings directly,
not through the barrel. `src/components/index.ts` defines the public exports and
`src/index.ts` reexports them for `@edhspace/ui` consumer imports.
The existing `Panel` and `PanelLayout` names refer to the same component.

Run `npm run build`, `npm run typecheck`, and `npm test` in this directory.
Build emits ESM/CommonJS, declarations and `dist/styles.css`; React remains a peer.
Native hosts must deduplicate React/React DOM across linked packages.
`npm pack --dry-run` inspects distributable files without publication.
