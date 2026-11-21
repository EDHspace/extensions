import { useState } from "react";
import { useExtension } from "@edhspace/api/react";
import { Button, Field, FilterBar, Notice, Panel } from "@edhspace/ui";

export default function CardLookupPanel() {
    const api = useExtension();
    const [name, setName] = useState("Sol Ring");
    const [result, setResult] = useState<string>();
    const [error, setError] = useState<string>();
    const [loading, setLoading] = useState(false);
    async function lookup() {
        setLoading(true);
        setError(undefined);
        setResult(undefined);
        try {
            const response = await api.network.request({
                endpoint: "scryfall",
                path: "named",
                query: { exact: name.trim() },
            });
            const card = response.data;
            if (
                !card ||
                typeof card !== "object" ||
                Array.isArray(card) ||
                typeof card.name !== "string" ||
                typeof card.type_line !== "string"
            )
                throw new Error("Scryfall returned unexpected card data.");
            setResult(`${card.name} - ${card.type_line}`);
        } catch (error) {
            setError(error instanceof Error ? error.message : "The card lookup failed.");
        } finally {
            setLoading(false);
        }
    }
    return (
        <Panel title="External card lookup">
            <FilterBar label="Card lookup">
                <Field
                    label="Card name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                />
                <Button
                    disabled={!name.trim()}
                    aria-disabled={loading}
                    onClick={() => {
                        if (!loading) void lookup();
                    }}
                >
                    {loading ? "Waiting for lookup..." : "Look up card"}
                </Button>
            </FilterBar>
            <p>Your card-name query is sent to Scryfall after approval.</p>
            {error && <Notice error>{error}</Notice>}
            {result && <Notice>{result}</Notice>}
        </Panel>
    );
}
