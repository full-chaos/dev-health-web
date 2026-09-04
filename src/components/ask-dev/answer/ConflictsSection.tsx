"use client";

import type { DevAnswer } from "@/lib/dev/generated";

import type { SafeProse } from "./labels";

/** Server-declared disagreements between sources. Model-authored prose, so
 * every summary goes through `safeProse`. */
export function ConflictsSection({
    conflicts,
    safeProse,
}: {
    conflicts: NonNullable<DevAnswer["conflicts"]>;
    safeProse: SafeProse;
}) {
    return (
        <section
            className="rounded-(--radius-md) border border-(--caution)/30 bg-(--caution)/8 p-3"
            aria-label="Conflicting evidence"
        >
            <p className="text-label-caps text-(--caution)">Conflicting evidence</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-(--text-secondary)">
                {conflicts.map((conflict) => (
                    <li key={conflict.summary}>{safeProse(conflict.summary)}</li>
                ))}
            </ul>
        </section>
    );
}
