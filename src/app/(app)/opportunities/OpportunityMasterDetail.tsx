"use client";

import { useState } from "react";

import { ArrowRight } from "lucide-react";

import { Section } from "@/components/ui/Section";
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
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Section
                aria-label="Open opportunities"
                data-testid="opportunity-list"
                title="Open opportunities"
                description={`${items.length} ${items.length === 1 ? "captured signal" : "captured signals"}`}
            >
                <ul className="space-y-2">
                    {items.map((item, index) => {
                        const active = item === current;
                        return (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    aria-current={active ? "true" : undefined}
                                    onClick={() => setSelected(index)}
                                    className={`flex w-full items-center justify-between gap-3 rounded-sm border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)/60 ${
                                        active
                                            ? "border-(--accent) bg-(--accent)/5"
                                            : "border-(--card-stroke) bg-background hover:bg-(--card-80)"
                                    }`}
                                >
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold">
                                            {item.title}
                                        </span>
                                        <span className="mt-1 block text-xs text-(--ink-muted)">
                                            {item.rationale}
                                        </span>
                                    </span>
                                    <ArrowRight
                                        aria-hidden="true"
                                        className="h-4 w-4 shrink-0 text-(--ink-muted)"
                                    />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </Section>
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
