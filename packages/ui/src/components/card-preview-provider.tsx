import type { ComponentType, ReactNode } from "react";
import { CardPreviewContext, type PreviewProps } from "../contexts/card-preview";

export function CardPreviewProvider({
    renderer,
    children,
}: {
    renderer: ComponentType<PreviewProps>;
    children: ReactNode;
}) {
    return <CardPreviewContext.Provider value={renderer}>{children}</CardPreviewContext.Provider>;
}
