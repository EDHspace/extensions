import { Symbol } from "./symbol";

export function SymbolText({ text }: { text: string | null | undefined }) {
    return (
        <>
            {text?.split(/(\{[^}]+\})/g).map((part, index) =>
                /^\{[^}]+\}$/.test(part) ? (
                    <span className="oracle-symbol" key={`${index}:${part}`} title={part}>
                        <Symbol token={part} labeled />
                    </span>
                ) : (
                    part
                )
            )}
        </>
    );
}
