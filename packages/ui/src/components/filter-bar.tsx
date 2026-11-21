import type { ReactNode } from "react";

export function FilterBar({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="edhspace-filter-bar" role="group" aria-label={label}>
            {children}
        </div>
    );
}
