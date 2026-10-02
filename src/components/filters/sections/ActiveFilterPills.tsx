import { FilterPill } from "../FilterPill";
import type { UnreadFilter } from "../filterBarConfig";

type ActiveFilterPillsProps = {
    developers: string[];
    onClearDeveloper: (value: string) => void;
    onClearRepo: (value: string) => void;
    onClearWorkCategory: (value: string) => void;
    repos: string[];
    /** Filters the view's queries do not read: no pill for a value left in an old URL. */
    unread?: readonly UnreadFilter[];
    workCategory: string[];
};

export function ActiveFilterPills({
    developers,
    onClearDeveloper,
    onClearRepo,
    onClearWorkCategory,
    repos,
    unread = [],
    workCategory,
}: ActiveFilterPillsProps) {
    return (
        <div className="flex flex-wrap gap-2">
            {repos.map((repo) => (
                <FilterPill
                    key={`repo-${repo}`}
                    label="Repo"
                    value={repo}
                    onClear={() => onClearRepo(repo)}
                />
            ))}
            {(unread.includes("developers") ? [] : developers).map((dev) => (
                <FilterPill
                    key={`dev-${dev}`}
                    label="Dev"
                    value={dev}
                    onClear={() => onClearDeveloper(dev)}
                />
            ))}
            {(unread.includes("workCategory") ? [] : workCategory).map((cat) => (
                <FilterPill
                    key={`cat-${cat}`}
                    label="Work"
                    value={cat}
                    onClear={() => onClearWorkCategory(cat)}
                />
            ))}
        </div>
    );
}
