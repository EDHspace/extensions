import { useEffect, useId, useRef, useState } from "react";
import { ActionBar } from "./action-bar";
import { Button } from "./button";

export function ApiRequestDialog({
    extension,
    url,
    method,
    data,
    onAccept,
    onCancel,
}: {
    extension: string;
    url: string;
    method: "GET" | "POST";
    data: string;
    onAccept(remember: boolean): void;
    onCancel(): void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const cancel = useRef<HTMLButtonElement>(null);
    const title = useId();
    const description = useId();
    const [remember, setRemember] = useState(false);
    useEffect(() => {
        const element = dialog.current;
        const previous = element?.ownerDocument.activeElement;
        element?.showModal();
        cancel.current?.focus();
        return () => {
            element?.close();
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
        };
    }, []);
    return (
        <dialog
            ref={dialog}
            className="edhspace-api-dialog"
            aria-labelledby={title}
            aria-describedby={description}
            onCancel={(event) => {
                event.preventDefault();
                onCancel();
            }}
            onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                const controls = Array.from(
                    event.currentTarget.querySelectorAll<HTMLElement>(
                        'button:not([disabled]), input:not([disabled]), [tabindex="0"]'
                    )
                );
                const first = controls[0];
                const last = controls[controls.length - 1];
                const active = event.currentTarget.ownerDocument.activeElement;
                if (event.shiftKey && active === first) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && active === last) {
                    event.preventDefault();
                    first?.focus();
                }
            }}
        >
            <h2 id={title}>Allow API request?</h2>
            <p id={description}>{extension} will send the shown data to this service.</p>
            <dl>
                <dt>Request</dt>
                <dd>{method}</dd>
                <dt>Destination</dt>
                <dd>{url}</dd>
            </dl>
            <pre aria-label="Request data" tabIndex={0}>
                {data}
            </pre>
            <p>EDHspace cookies and account credentials are not sent.</p>
            {method === "GET" && (
                <label className="edhspace-api-remember">
                    <input
                        type="checkbox"
                        checked={remember}
                        onChange={(event) => setRemember(event.target.checked)}
                    />
                    Allow GET requests to this API for this session
                </label>
            )}
            <ActionBar label="API request approval">
                <Button ref={cancel} onClick={onCancel}>
                    Cancel
                </Button>
                <Button onClick={() => onAccept(remember)}>Allow request</Button>
            </ActionBar>
        </dialog>
    );
}
