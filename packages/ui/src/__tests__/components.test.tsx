import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, CardList, Field, PanelLayout, CardPreviewProvider } from "../index";

describe("extension UI", () => {
    it("renders safe card names, quantities and accessible mana costs", () => {
        const markup = renderToStaticMarkup(
            <CardList
                cards={[
                    { id: "test", name: "<script>card</script>", quantity: 2, manaCost: "{2}{W}" },
                ]}
                onInspect={() => {}}
            />
        );
        expect(markup).toContain("&lt;script&gt;card&lt;/script&gt;");
        expect(markup).toContain('aria-label="2 copies"');
        expect(markup).toContain('aria-label="Mana cost {2}{W}"');
        expect(markup).toContain('type="button"');
    });
    it("associates field labels with their input and preserves disabled action states", () => {
        const markup = renderToStaticMarkup(
            <PanelLayout title="Preferences">
                <Field label="Deck name" id="deck-name" required />
                <Button disabled>Save</Button>
            </PanelLayout>
        );
        expect(markup).toContain('for="deck-name"');
        expect(markup).toContain('id="deck-name" required=""');
        expect(markup).toContain('disabled="" type="button"');
    });
    it("uses the host's preview anchor without replacing card quantities or mana symbols", () => {
        const markup = renderToStaticMarkup(
            <CardPreviewProvider
                renderer={({ card, onInspect }) => (
                    <a href="#preview" onClick={onInspect}>
                        {card.name}
                    </a>
                )}
            >
                <CardList
                    cards={[{ id: "ring", name: "Sol Ring", quantity: 1, manaCost: "{1}" }]}
                    onInspect={() => {}}
                />
            </CardPreviewProvider>
        );
        expect(markup).toContain('<a href="#preview">Sol Ring</a>');
        expect(markup).toContain('aria-label="Mana cost {1}"');
        expect(markup).not.toContain('type="button"');
    });
});
