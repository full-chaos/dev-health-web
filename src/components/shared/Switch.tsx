export type SwitchProps = {
    checked: boolean;
    onChange: (next: boolean) => void;
    "aria-label": string;
    disabled?: boolean;
    "data-testid"?: string;
};

/** On/off switch. The state is the `checked` prop; the parent owns it, so it comes from the server. */
export function Switch({ checked, onChange, disabled, ...rest }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={rest["aria-label"]}
            data-testid={rest["data-testid"]}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) disabled:cursor-not-allowed disabled:opacity-50 ${
                checked
                    ? "border-(--action) bg-(--action)"
                    : "border-(--card-stroke) bg-(--card-80)"
            }`}
        >
            <span
                aria-hidden="true"
                className={`inline-block h-4 w-4 rounded-full bg-(--card) shadow-sm transition-transform ${
                    checked ? "translate-x-6" : "translate-x-1"
                }`}
            />
        </button>
    );
}
