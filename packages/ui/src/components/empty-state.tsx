import type { ReactNode } from "react";

export function EmptyState({
    title,
    children,
    action,
}: {
    title: string;
    children: ReactNode;
    action?: ReactNode;
}) {
    return (
        <section className="edhspace-empty" role="status">
            <h3>{title}</h3>
            <p>{children}</p>
            {action}
        </section>
    );
}
