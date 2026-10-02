"use client";

import { useState } from "react";

import type { MetricFilter } from "@/lib/filters/types";
import type { OpportunityCard as OpportunityCardData } from "@/lib/types";

import { OpportunityCard } from "./OpportunityCard";

type OpportunityMasterDetailProps = {
    items: OpportunityCardData[];
    filters: MetricFilter;
    activeRole?: string;
};

/**
 * List on the left (title and the rationale sentence), the selected opportunity on the right.
 * Selection is local state: opportunity ids are positional, so no address parameter carries it.
 */
export function OpportunityMasterDetail({
    items,
    filters,
    activeRole,
}: OpportunityMasterDetailProps) {
    const [selected, setSelected] = useState(0);
    const current = items[Math.min(selected, items.length - 1)];

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section aria-label="Open opportunities" data-testid="opportunity-list">
                <h2 className="font-(--font-display) text-lg">Open opportunities</h2>
                <p className="mt-1 text-xs text-(--ink-muted)">
                    {items.length} {items.length === 1 ? "captured signal" : "captured signals"}
                </p>
                <ul className="mt-3 space-y-2">
                    {items.map((item, index) => {
                        const active = item === current;
                        return (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    aria-current={active ? "true" : undefined}
                                    onClick={() => setSelected(index)}
                                    className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/60 ${
                                        active
                                            ? "border-(--accent-2) bg-(--accent-2)/5"
                                            : "border-(--card-stroke) bg-(--card-70) hover:bg-(--card-80)"
                                    }`}
                                >
                                    <span className="block font-medium">{item.title}</span>
                                    <span className="mt-1 block text-xs text-(--ink-muted)">
                                        {item.rationale}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </section>
            {current ? (
                <OpportunityCard
                    key={current.id}
                    card={current}
                    filters={filters}
                    activeRole={activeRole}
                />
            ) : null}
        </div>
    );
}
