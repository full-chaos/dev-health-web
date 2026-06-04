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
}: QuickFilterMenuProps) {
	const isActive = active.length > 0;

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpenMenu(openMenu === menuKey ? null : menuKey)}
				className={`flex items-center gap-2 rounded-full border border-(--card-stroke) bg-card px-4 py-2 text-xs ${
					variant === "accent" && isActive
						? "border-(--accent) text-(--accent)"
						: ""
				}`}
				aria-expanded={openMenu === menuKey}
			>
				<span className="uppercase tracking-[0.2em] text-(--ink-muted)">
					{label}
				</span>
				{value ? (
					<span className="font-medium text-foreground">{value}</span>
				) : null}
				<span className="text-(--ink-muted)">▾</span>
			</button>
			{openMenu === menuKey && (
				<div className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border border-(--card-stroke) bg-card p-4 shadow-lg">
					<div className="max-h-56 overflow-auto">
						<OptionList
							emptyLabel={emptyLabel}
							items={items}
							onChange={onChange}
							selected={active}
							toggleValue={toggleValue}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
