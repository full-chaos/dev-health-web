import { ChevronDown } from "lucide-react";

import { OptionList } from "./OptionList";

type QuickFilterMenuProps = {
    active: string[];
    emptyLabel: string;
    items: string[];
    label: string;
    menuKey: string;
    onChange: (nextValues: string[]) => void;
    openMenu: string | null;
    setOpenMenu: (value: string | null) => void;
    toggleValue: (values: string[], value: string) => string[];
    variant?: "default" | "accent";
    /** Optional selection summary rendered in the trigger (e.g. "All", "org/api", "2 selected"). */
    value?: string;
    /** The selection is fixed: the trigger does not open the menu. */
    disabled?: boolean;
    /** One value at most (radios). See `OptionList`. */
    single?: boolean;
};

export function QuickFilterMenu({
    active,
    emptyLabel,
    items,
    label,
    menuKey,
    onChange,
    openMenu,
    setOpenMenu,
    toggleValue,
    variant = "accent",
    value,
    disabled,
    single,
}: QuickFilterMenuProps) {
    const isActive = active.length > 0;

    return (
        <div className="relative">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpenMenu(openMenu === menuKey ? null : menuKey)}
                // Prototype `.scope-item`: label and value with no pill border or fill.
                className={`flex items-center gap-2 rounded-(--radius-sm) px-1.5 py-0.5 text-xs transition-colors hover:bg-(--card-80) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) disabled:cursor-default disabled:hover:bg-transparent ${
                    variant === "accent" && isActive ? "text-(--accent-text)" : ""
                }`}
                aria-expanded={openMenu === menuKey}
            >
                <span className="text-label-caps font-semibold uppercase text-(--text-muted)">
                    {label}
                </span>
                {value ? <span className="font-medium text-foreground">{value}</span> : null}
                <ChevronDown aria-hidden="true" className="size-3.5 text-(--text-muted)" />
            </button>
            {openMenu === menuKey && (
                <div className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
                    <div className="max-h-56 overflow-auto">
                        <OptionList
                            emptyLabel={emptyLabel}
                            items={items}
                            onChange={onChange}
                            selected={active}
                            single={single}
                            toggleValue={toggleValue}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
