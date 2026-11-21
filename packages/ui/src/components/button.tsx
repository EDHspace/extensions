import type { ComponentProps } from "react";

export function Button({ type = "button", className = "", ...props }: ComponentProps<"button">) {
    return <button {...props} type={type} className={`edhspace-button ${className}`.trim()} />;
}
