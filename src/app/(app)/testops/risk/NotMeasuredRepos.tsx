import { formatNumber } from "@/lib/formatters";

export type NotMeasuredRepo = { id: string; label: string; absent: string[] };

type NotMeasuredReposProps = { items: NotMeasuredRepo[]; plotted: number };

export function NotMeasuredRepos({ items, plotted }: NotMeasuredReposProps) {
    if (items.length === 0) return null;
    return (
        <div className="mt-4" data-testid="risk-not-measured">
            <p className="text-xs text-(--ink-muted)" data-testid="risk-not-measured-count">
                {formatNumber(plotted)} plotted, {formatNumber(items.length)} not measured
            </p>
            <ul className="mt-2 flex flex-col gap-1 rounded-md bg-(--surface2) p-3 text-sm text-(--text-primary)">
                {items.map((item) => (
                    <li key={item.id} data-repo={item.label}>
                        <span className="font-medium">{item.label}</span>
                        <span className="text-(--ink-muted)">
                            {" "}
                            - {item.absent.join(" and ")} not measured
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
