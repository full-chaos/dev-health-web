"use client";

import type { DevAnswer } from "@/lib/dev/generated";

import type { SafeProse } from "./labels";

/**
 * The answer's own declared limitations.
 *
 * `warnings` is free-text on the wire today, and model-authored, so each entry
 * goes through `safeProse`. A typed limitation vocabulary would let this
 * render a stable caption per kind instead of echoing prose; until the wire
 * carries one, sanitizing is the only guard there is.
 */
export function LimitationsSection({
    safeProse,
    warnings,
}: {
    safeProse: SafeProse;
    warnings: NonNullable<DevAnswer["warnings"]>;
}) {
    return (
        <section
            className="rounded-(--radius-md) border border-(--caution)/30 bg-(--caution)/8 p-3"
            aria-label="Answer limitations"
        >
            <p className="text-label-caps text-(--caution)">Limitations</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-(--text-secondary)">
                {warnings.map((warning) => (
                    <li key={warning}>{safeProse(warning)}</li>
                ))}
            </ul>
        </section>
    );
}
