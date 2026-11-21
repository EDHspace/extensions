import type { CardListItem } from "../types/card";
import { CardPreview } from "./card-preview";
import { ManaCost } from "./mana-cost";

export function CardList<T extends CardListItem>({
    cards,
    onInspect,
    label = "Cards",
}: {
    cards: readonly T[];
    onInspect(card: T): void;
    label?: string;
}) {
    return (
        <ul className="edhspace-card-list" aria-label={label}>
            {cards.map((card) => (
                <li key={card.id}>
                    <span aria-label={`${card.quantity} copies`}>{card.quantity}</span>
                    <CardPreview card={card} onInspect={() => onInspect(card)} />
                    <ManaCost cost={card.manaCost} />
                </li>
            ))}
        </ul>
    );
}
