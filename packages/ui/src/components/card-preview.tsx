import { useContext } from "react";
import { CardPreviewContext, type PreviewProps } from "../contexts/card-preview";
import { Button } from "./button";

export function CardPreview({ card, onInspect }: PreviewProps) {
    const Renderer = useContext(CardPreviewContext);
    return Renderer ? (
        <Renderer card={card} onInspect={onInspect} />
    ) : (
        <Button onClick={onInspect}>{card.name}</Button>
    );
}
