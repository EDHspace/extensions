import type { CSSProperties, ReactNode } from "react";

export type Theme = {
    background: string;
    foreground: string;
    muted: string;
    accent: string;
    border: string;
    font: string;
};
export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
    const style: CSSProperties & Record<`--edhspace-${string}`, string> = {
        "--edhspace-background": theme.background,
        "--edhspace-foreground": theme.foreground,
        "--edhspace-muted": theme.muted,
        "--edhspace-accent": theme.accent,
        "--edhspace-border": theme.border,
        "--edhspace-font": theme.font,
    };
    return (
        <div className="edhspace-ui" style={style}>
            {children}
        </div>
    );
}
