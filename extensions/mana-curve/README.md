# Mana curve & draw calculator

Read-only extension using `@edhspace/api` and `@edhspace/ui`.
Requests one deck read and permission-gated native card inspection; never saves
or changes the deck.

The curve counts quantities and excludes commanders/land fronts. Draw probability
uses sampling without replacement and no mulligans. The default model counts the
library and its land-front cards, excluding commanders; controls can adjust the
model independently. Invalid inputs remove the result and explain the problem.

From the community monorepo root run `npm run build`, then
`npm run dev -- extensions/mana-curve`. The mock workbench needs no login.
In EDHspace open Workspace > Extensions with an owned deck and approve access.
