import { useState } from "react";

export function Symbol({ token, labeled = false }: { token: string; labeled?: boolean }) {
    const [failed, setFailed] = useState(false);
    const name = token.slice(1, -1).replaceAll("/", "");
    return failed ? (
        <span>{token}</span>
    ) : (
        <img
            src={`https://svgs.scryfall.io/card-symbols/${encodeURIComponent(name)}.svg`}
            alt={labeled ? token : ""}
            width="16"
            height="16"
            loading="lazy"
            onError={() => setFailed(true)}
        />
    );
}
