# External card lookup

An API-connected extension using the SDK and shared UI. Enter a card name and
choose **Look up card**. The host shows the destination and query before sending
anything to Scryfall. Cancel leaves the request unsent; an optional GET grant lasts
only for the current session.

```sh
npm run dev -- extensions/card-lookup
```

The workbench uses synthetic data. This extension sends only the card name you
enter, never your deck or EDHspace account credentials. Scryfall must allow CORS;
provider failures appear in the panel. Network requests are not made on mount.
