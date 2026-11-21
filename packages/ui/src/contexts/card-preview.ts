import { createContext, type ComponentType } from "react";
import type { CardListItem } from "../types/card";

export type PreviewProps = { card: CardListItem; onInspect(): void };
export const CardPreviewContext = createContext<ComponentType<PreviewProps> | undefined>(undefined);
