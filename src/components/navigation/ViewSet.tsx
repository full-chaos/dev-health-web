import Link from "next/link";
import type { NavChildRoute } from "@/lib/navigation/areas";

export type ViewSetItem = Pick<
    NavChildRoute,
    "id" | "label" | "path" | "navVisible" | "preview" | "exact" | "demoted"
>;

type ViewSetProps = {
    orientation: "vertical" | "tabs";
    items: ReadonlyArray<ViewSetItem>;
    activeId?: string;
    overviewId?: string;
    ariaLabel?: string;
    className?: string;
};

const TAB_CONTAINER =
    "flex items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-(--border) px-1 scrollbar-hide";

const TAB_BASE =
    "-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-3 text-[10px] uppercase tracking-[0.18em] transition-all";

const TAB_ACTIVE = "border-(--accent) text-foreground font-semibold";
const TAB_INACTIVE =
    "border-transparent text-(--ink-muted) hover:border-(--card-stroke) hover:text-foreground";

const VERTICAL_CONTAINER = "mt-1 ml-3 flex flex-col gap-0.5 border-l border-(--border) pl-2";

const VERTICAL_BASE =
    "group relative flex items-center rounded-xl px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)/35";

const VERTICAL_ACTIVE =
    "bg-(--accent)/12 font-medium text-foreground before:absolute before:left-0 before:top-1/4 before:h-1/2 before:w-0.5 before:rounded-full before:bg-(--accent)";

function visibleItems(items: ReadonlyArray<ViewSetItem>) {
    return items.filter((item) => item.navVisible && !item.preview);
}

function isOverviewItem(item: ViewSetItem, overviewId: string | undefined) {
    return item.id === overviewId || item.id.endsWith("overview");
}

function orderItems(items: ReadonlyArray<ViewSetItem>, overviewId: string | undefined) {
    const [overviewItems, remainingItems] = visibleItems(items).reduce<
        [ViewSetItem[], ViewSetItem[]]
    >(
        (orderedItems, item) => {
            orderedItems[isOverviewItem(item, overviewId) ? 0 : 1].push(item);
            return orderedItems;
        },
        [[], []],
    );

    return [...overviewItems, ...remainingItems];
}

function verticalInactiveClass(item: ViewSetItem) {
    return `border border-transparent ${
        item.demoted ? "text-(--ink-muted)/70" : "text-(--ink-muted)"
    } hover:border-(--card-stroke) hover:bg-(--card-80) hover:text-foreground focus-visible:border-(--card-stroke) focus-visible:bg-(--card-80) focus-visible:text-foreground`;
}

export function ViewSet({
    orientation,
    items,
    activeId,
    overviewId,
    ariaLabel = "Views",
    className,
}: ViewSetProps) {
    const orderedItems = orderItems(items, overviewId);

    if (orientation === "tabs") {
        return (
            <div
                aria-label={ariaLabel}
                className={`${TAB_CONTAINER} ${className ?? ""}`.trim()}
                role="tablist"
            >
                {orderedItems.map((item) => {
                    const isActive = item.id === activeId;
                    return (
                        <Link
                            key={item.id}
                            href={item.path}
                            role="tab"
                            aria-selected={isActive ? "true" : "false"}
                            aria-current={isActive ? "page" : undefined}
                            className={`${TAB_BASE} ${isActive ? TAB_ACTIVE : TAB_INACTIVE}`}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </div>
        );
    }

    return (
        <div className={`${VERTICAL_CONTAINER} ${className ?? ""}`.trim()}>
            {orderedItems.map((item) => {
                const isActive = item.id === activeId;
                return (
                    <Link
                        key={item.id}
                        href={item.path}
                        aria-current={isActive ? "page" : undefined}
                        className={`${VERTICAL_BASE} ${
                            isActive ? VERTICAL_ACTIVE : verticalInactiveClass(item)
                        }`}
                    >
                        <span>{item.label}</span>
                    </Link>
                );
            })}
        </div>
    );
}
