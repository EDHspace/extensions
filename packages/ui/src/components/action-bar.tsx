import type { ReactNode } from "react";

export function ActionBar({ children, label }: { children: ReactNode; label: string }) {
    return (
        <div className="edhspace-actions" role="group" aria-label={label}>
            {children}
        </div>
    );
}
