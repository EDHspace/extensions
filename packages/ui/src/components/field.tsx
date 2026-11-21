import { useId, type ComponentProps } from "react";

export function Field({ label, ...props }: ComponentProps<"input"> & { label: string }) {
    const id = useId();
    return (
        <label className="edhspace-field" htmlFor={props.id ?? id}>
            {label}
            <input {...props} id={props.id ?? id} />
        </label>
    );
}
