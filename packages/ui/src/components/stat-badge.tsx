import type { ReactNode } from "react";

export function StatBadge({ label, value }: { label: string; value: ReactNode }) {
    return (
        <span className="edhspace-stat">
            {label}: <strong>{value}</strong>
        </span>
    );
}
