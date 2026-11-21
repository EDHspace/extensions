import { useEffect, useState } from "react";
import { useActiveDeck, useExtension } from "@edhspace/api/react";
import { drawProbability, manaCurve } from "@edhspace/api/math";
import {
    ActionPanel,
    Button,
    CardList,
    DataTable,
    EmptyState,
    Field,
    FilterBar,
    Notice,
    PanelLayout,
    StatBadge,
} from "@edhspace/ui";

export default function ManaCurvePanel() {
    const api = useExtension();
    const { data: deck, loading, error, refresh } = useActiveDeck();
    const [actionError, setActionError] = useState<Error>();
    const [model, setModel] = useState({ population: 99, successes: 38, draws: 7, atLeast: 2 });
    useEffect(() => {
        if (!deck) return;
        const library = deck.cards.filter((card) => !card.commander);
        const population = library.reduce((sum, card) => sum + card.quantity, 0);
        const lands = library
            .filter((card) => /\bLand\b/.test(card.typeLine?.split(/\s*\/\/\s*/)[0] ?? ""))
            .reduce((sum, card) => sum + card.quantity, 0);
        if (population)
            setModel({
                population,
                successes: lands,
                draws: Math.min(7, population),
                atLeast: Math.min(2, population),
            });
    }, [deck?.id, deck?.revision]);
    let probability: number | undefined;
    let inputError = "";
    try {
        probability = drawProbability(model);
    } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        inputError = error.message;
    }
    return (
        <PanelLayout
            title={deck?.name ?? "Mana curve & draw calculator"}
            actions={
                <ActionPanel label="Calculator actions">
                    <Button onClick={() => void refresh()} disabled={loading}>
                        Refresh deck
                    </Button>
                </ActionPanel>
            }
        >
            {error && <Notice error>{error.message}</Notice>}
            {actionError && <Notice error>{actionError.message}</Notice>}
            {loading && !deck && <Notice>Loading the approved deck...</Notice>}
            {deck && (
                <>
                    <p>
                        <StatBadge
                            label="Cards"
                            value={deck.cards.reduce((sum, card) => sum + card.quantity, 0)}
                        />
                        <StatBadge label="Format" value={deck.format} />
                    </p>
                    <h3>Mana curve</h3>
                    <p>
                        Excludes commanders and land-front cards. Unknown mana values remain
                        visible.
                    </p>
                    {manaCurve(deck.cards).length ? (
                        <DataTable
                            label="Mana curve"
                            rows={manaCurve(deck.cards)}
                            rowId={(row) => row.manaValue}
                            columns={[
                                { id: "mana", title: "Mana value", render: (row) => row.manaValue },
                                { id: "count", title: "Cards", render: (row) => row.count },
                            ]}
                        />
                    ) : (
                        <EmptyState title="No spells to plot">
                            Add nonland cards to your deck to see its curve.
                        </EmptyState>
                    )}
                </>
            )}
            <h3>Draw probability</h3>
            <p>
                Without replacement, with no mulligans. Commanders start outside the library. You
                can adjust this model without editing the deck.
            </p>
            <FilterBar label="Probability model">
                {(
                    [
                        ["population", "Library size"],
                        ["successes", "Target cards"],
                        ["draws", "Cards drawn"],
                        ["atLeast", "Minimum targets"],
                    ] as const
                ).map(([key, label]) => (
                    <Field
                        key={key}
                        label={label}
                        type="number"
                        step={1}
                        min={key === "population" ? 1 : 0}
                        max={key === "population" ? 1000 : model.population}
                        value={Number.isNaN(model[key]) ? "" : model[key]}
                        onChange={(event) =>
                            setModel((current) => ({
                                ...current,
                                [key]: event.target.valueAsNumber,
                            }))
                        }
                    />
                ))}
            </FilterBar>
            {inputError ? (
                <Notice error>{inputError}</Notice>
            ) : (
                <p role="status" aria-live="polite">
                    <strong>{(probability! * 100).toFixed(2)}%</strong> chance of drawing at least{" "}
                    {model.atLeast} targets.
                </p>
            )}
            {deck?.cards.length ? (
                <>
                    <h3>Deck cards</h3>
                    <CardList
                        cards={deck.cards}
                        onInspect={(card) => {
                            setActionError(undefined);
                            api.cards
                                .inspect(card.id)
                                .catch((error: Error) => setActionError(error));
                        }}
                    />
                </>
            ) : null}
        </PanelLayout>
    );
}
