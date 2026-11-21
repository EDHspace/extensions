import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { context } from "esbuild";
import { validateExtension, importBoundary } from "./build";

export async function devExtension(directory: string) {
    const { root, pkg, manifest, dependencies, directDependencies } =
        await validateExtension(directory);
    const output = path.join(root, ".local", "dev");
    await mkdir(output, { recursive: true });
    const source = `
import React from "react";
import { createRoot } from "react-dom/client";
import { createExtensionClient, ExtensionError } from "@edhspace/api";
import { ExtensionSession, createNetworkHandler, NetworkApprovalQueue } from "@edhspace/api/host";
import { ExtensionProvider } from "@edhspace/api/react";
import { ApiRequestDialog } from "@edhspace/ui";
import "@edhspace/ui/styles.css";
import Panel from ${JSON.stringify(path.join(root, pkg.panels[0].entry))};
const deck = { id: "22222222-2222-4222-8222-222222222222", name: "SDK mock deck", revision: "1", format: "commander",
cards: [{id:"forest",name:"Forest",quantity:38,manaValue:0,manaCost:"",typeLine:"Basic Land"},
{id:"ring",name:"Sol Ring",quantity:1,manaValue:1,manaCost:"{1}",typeLine:"Artifact"},
{id:"sample",name:"Sample spells (mock)",quantity:60,manaValue:3,typeLine:"Sorcery"}] };
const sessionId = crypto.randomUUID();
const manifest = ${JSON.stringify(manifest)};
const approvals = new NetworkApprovalQueue();
const session = new ExtensionSession(manifest, sessionId, manifest.permissions, () => true, {
"network.request": createNetworkHandler(manifest, {approve: approvals.approve}),
"deck.read": async()=>deck,
"selection.read": async()=>[],
"cards.inspect": async({cardId})=>{
const card=deck.cards.find(c=>c.id===cardId);
if(!card)throw new ExtensionError("Only mock deck cards can be inspected.","denied");
alert("Mock preview: "+card.name);return {opened:true}},
"preferences.get": async()=>Object.fromEntries(manifest.preferences.map(p=>[p.id,p.default])),
});
const api = createExtensionClient(request=>session.execute(request), sessionId, manifest.permissions);
function Workbench(){
const pending=React.useSyncExternalStore(approvals.subscribe,approvals.getSnapshot)[0];
return <div className="edhspace-ui"><header><p>Synthetic data only. External API requests require your approval.</p>
<button type="button" onClick={()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==="dark"?"light":"dark"}}>Toggle theme</button></header>
<ExtensionProvider api={api} revision="1"><Panel/></ExtensionProvider>
{pending&&<ApiRequestDialog key={pending.id} extension={manifest.title} url={pending.request.url} method={pending.request.method}
data={JSON.stringify({query:pending.request.query,body:pending.request.body},null,2)}
onAccept={remember=>approvals.answer(pending.id,true,remember)} onCancel={()=>approvals.answer(pending.id,false)}/>}
</div>}
createRoot(document.getElementById("root")).render(<Workbench/>);
`;
    const bundler = await context({
        stdin: { contents: source, loader: "tsx", resolveDir: root },
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        outfile: path.join(output, "app.js"),
        plugins: [importBoundary(root, dependencies, directDependencies)],
    });
    try {
        await bundler.rebuild();
        await bundler.watch();
    } catch (error) {
        await bundler.dispose();
        throw error;
    }
    const assets = new Map([
        ["/app.js", ["app.js", "text/javascript"]],
        ["/app.css", ["app.css", "text/css"]],
    ]);
    const server = createServer(async (request, response) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1:5186");
        if (url.pathname === "/" || url.pathname === "/health") {
            response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
            response.end(
                `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EDHspace extension workbench</title><link rel="stylesheet" href="/app.css"><style>body{margin:0;font:16px system-ui}html[data-theme=dark]{--set-panel:#202620;--set-text:#f3f6f3;--set-muted:#bfcbbf;--set-accent:#8fca9b;--set-border:#81968b}header{padding:1rem}button{min-height:44px}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`
            );
            return;
        }
        const asset = assets.get(url.pathname);
        if (!asset) {
            response.writeHead(404);
            response.end("Not found.");
            return;
        }
        try {
            response.writeHead(200, { "Content-Type": asset[1], "Cache-Control": "no-store" });
            response.end(await readFile(path.join(output, asset[0])));
        } catch (error) {
            console.error("Workbench asset failed.", error);
            response.destroy();
        }
    });
    server.on("error", (error) => {
        console.error("Workbench server failed.", error);
        void bundler.dispose();
        process.exitCode = 1;
    });
    server.listen(5186, "127.0.0.1", () =>
        console.log("Extension workbench: http://127.0.0.1:5186")
    );
    for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.once(signal, () => {
            server.close();
            void bundler.dispose();
        });
}
