import type { ReactNode } from "react";

export function Panel({
    title,
    children,
    actions,
}: {
    title: string;
    children: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <section className="edhspace-panel">
            <header>
                <h2>{title}</h2>
                {actions}
            </header>
            {children}
        </section>
    );
}
