import type { ReactNode } from "react";

export function ActionPanel({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div
            className="edhspace-actions"
            role="toolbar"
            aria-label={label}
            onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                const controls = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")
                );
                const index = controls.findIndex((control) => control === event.target);
                if (index < 0 || !controls.length) return;
                event.preventDefault();
                const next =
                    event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? controls.length - 1
                          : (index + (event.key === "ArrowRight" ? 1 : -1) + controls.length) %
                            controls.length;
                controls[next].focus();
            }}
        >
            {children}
        </div>
    );
}
