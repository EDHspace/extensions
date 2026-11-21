import {
    createContext,
    useContext,
    useEffect,
    useCallback,
    useRef,
    useState,
    type ReactNode,
} from "react";
import type { ExtensionClient } from "./client";

const Context = createContext<{ api: ExtensionClient; revision: string } | undefined>(undefined);
export function ExtensionProvider({
    api,
    revision,
    children,
}: {
    api: ExtensionClient;
    revision: string;
    children: ReactNode;
}) {
    return <Context.Provider value={{ api, revision }}>{children}</Context.Provider>;
}
function useContextValue() {
    const context = useContext(Context);
    if (!context) throw new Error("Render this extension inside an EDHspace ExtensionProvider.");
    return context;
}
export function useExtension() {
    return useContextValue().api;
}
function useResource<T>(load: () => Promise<T>, revision: string) {
    const generation = useRef(0);
    const [data, setData] = useState<T>();
    const [error, setError] = useState<Error>();
    const [loading, setLoading] = useState(true);
    const refresh = useCallback(async () => {
        const current = ++generation.current;
        setLoading(true);
        setError(undefined);
        try {
            const result = await load();
            if (generation.current === current) setData(result);
        } catch (error) {
            if (generation.current === current)
                setError(
                    error instanceof Error ? error : new Error("Extension data could not be read.")
                );
        } finally {
            if (generation.current === current) setLoading(false);
        }
    }, [load]);
    useEffect(() => {
        void refresh();
        return () => {
            generation.current++;
        };
    }, [refresh, revision]);
    return { data, error, loading, refresh };
}
export function useActiveDeck() {
    const { api, revision } = useContextValue();
    return useResource(api.deck.read, revision);
}
export function useSelectedCards() {
    const { api, revision } = useContextValue();
    return useResource(api.selection.read, revision);
}
