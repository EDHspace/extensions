import { Symbol } from "./symbol";

export function ManaCost({ cost, title = cost }: { cost?: string; title?: string }) {
    if (!cost) return null;
    return (
        <span className="mana-cost" role="img" aria-label={`Mana cost ${cost}`} title={title}>
            {cost
                .split(/(\{[^}]+\})/g)
                .filter(Boolean)
                .map((part, index) =>
                    part.startsWith("{") && part.endsWith("}") ? (
                        <Symbol key={`${index}:${part}`} token={part} />
                    ) : (
                        <span key={index}>{part}</span>
                    )
                )}
        </span>
    );
}
