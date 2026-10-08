import { EntityLabel } from "@/components/labels/EntityLabel";
import { containsIdToken } from "@/lib/labels/idToken";
import { UNRESOLVED } from "@/lib/labels/unresolved";

export type EvidenceType = "prs" | "issues";
type Item = Record<string, unknown>;

const COLUMNS: Record<EvidenceType, string[]> = {
    prs: ["Item", "Repository", "State", "Opened", "Closed or merged"],
    issues: ["Item", "Repositories", "Provider", "State", "Opened", "Closed"],
};

const str = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

/** ISO date part of a timestamp the API returned; anything else is "no value". */
const day = (value: unknown): string | null => {
    const text = str(value);
    return text && /^\d{4}-\d{2}-\d{2}/u.test(text) ? text.slice(0, 10) : null;
};

const itemHref = (item: Item, fallback: string): string => {
    for (const candidate of [item.url, item.link, item.html_url, item.web_url, item.api_url]) {
        if (typeof candidate === "string" && candidate.length) return candidate;
    }
    return fallback;
};

const DASH = "—";

/** A work item key that is a name ("PROJ-12"); an id token is not shown. */
const itemKey = (value: string | null): string => {
    return value && !containsIdToken(value) ? value : UNRESOLVED;
};

const strList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v !== "") : [];

/**
 * Evidence rows of one person's metric, as typed columns (decision P3 = A; production printed the
 * raw record as JSON). Every cell comes from a field the API already returns; a missing field is
 * "—", never a guess. Pull requests: `title` / `number`, `repo_name`, `merged_at`, `created_at`.
 * Issues: `title`, `repo_names`, `provider`, `status`, `started_at`, `completed_at`. A repository
 * or work item with no served name reads "Unresolved"; an id is never shown.
 */
export function PersonEvidenceTable({
    type,
    items,
    fallbackHref,
}: {
    type: EvidenceType;
    items: Item[];
    fallbackHref: string;
}) {
    return (
        <table className="min-w-full border-collapse" data-testid="person-evidence-table">
            <thead className="text-left text-(--ink-muted)">
                <tr>
                    {COLUMNS[type].map((label) => (
                        <th key={label} className="border-b border-(--card-stroke) pb-2 pr-4">
                            {label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {items.map((item, index) => {
                    const href = itemHref(item, fallbackHref);
                    const isPr = type === "prs";
                    const title = isPr
                        ? (str(item.title) ??
                          (item.number != null ? `#${String(item.number)}` : null))
                        : (str(item.title) ?? itemKey(str(item.work_item_id)));
                    const repoName = str(item.repo_name);
                    const repoNames = strList(item.repo_names);
                    const second = isPr ? str(item.repo_id) : str(item.provider);
                    const state = isPr
                        ? day(item.merged_at)
                            ? "Merged"
                            : "Not merged"
                        : str(item.status);
                    const opened = day(isPr ? item.created_at : item.started_at);
                    const closed = day(isPr ? item.merged_at : item.completed_at);
                    return (
                        <tr
                            key={`${index}-${title ?? ""}`}
                            className="border-b border-(--card-stroke)"
                        >
                            <td className="py-2 pr-4 font-medium">
                                <a href={href} className="block text-foreground">
                                    {title ? <EntityLabel variant="text" id={title} /> : DASH}
                                </a>
                            </td>
                            {isPr ? (
                                <td className="py-2 pr-4 text-(--ink-muted)">
                                    {second || repoName ? (
                                        <EntityLabel id={second} displayName={repoName} />
                                    ) : (
                                        DASH
                                    )}
                                </td>
                            ) : (
                                <>
                                    <td className="py-2 pr-4 text-(--ink-muted)">
                                        {repoNames.length
                                            ? repoNames.map((name, i) => (
                                                  <span key={`${i}-${name}`}>
                                                      {i > 0 ? ", " : null}
                                                      <EntityLabel id={name} displayName={name} />
                                                  </span>
                                              ))
                                            : DASH}
                                    </td>
                                    <td className="py-2 pr-4 text-(--ink-muted)">
                                        {second ?? DASH}
                                    </td>
                                </>
                            )}
                            <td className="py-2 pr-4 text-(--ink-muted)">{state ?? DASH}</td>
                            <td className="py-2 pr-4 tabular-nums text-(--ink-muted)">
                                {opened ?? DASH}
                            </td>
                            <td className="py-2 tabular-nums text-(--ink-muted)">
                                {closed ?? DASH}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
