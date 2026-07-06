"use client";

type CidrFieldProps = {
    id: string;
    label: string;
    value: string;
    error: string | null;
    disabled?: boolean;
    onChangeAction: (value: string) => void;
};

/** Labeled IP/CIDR text input with inline, user-safe validation feedback. */
export function CidrField({ id, label, value, error, disabled, onChangeAction }: CidrFieldProps) {
    const errorId = `${id}-error`;

    return (
        <div>
            <label htmlFor={id} className="mb-1 block text-xs font-medium text-(--ink-muted)">
                {label}
            </label>
            <input
                id={id}
                type="text"
                placeholder="192.168.1.0/24"
                value={value}
                disabled={disabled}
                onChange={(event) => onChangeAction(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className={`w-full rounded-lg border bg-(--card-70) px-3 py-2 text-sm focus:outline-none ${
                    error
                        ? "border-(--negative) focus:border-(--negative)"
                        : "border-(--card-stroke) focus:border-(--accent)"
                }`}
            />
            {error ? (
                <p id={errorId} className="mt-1 text-xs text-(--negative)">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
