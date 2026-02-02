"use client";

import Link from "next/link";

type EvidenceItem = {
    id: string;
    title: string;
    url: string;
    type: "pr" | "issue" | "commit" | "other";
    meta?: string;
};

type EvidenceItemsProps = {
    items: EvidenceItem[];
};

export function EvidenceItems({ items }: EvidenceItemsProps) {
    if (!items || items.length === 0) return null;

    return (
        <section className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                Supporting Evidence
            </p>
            <div className="space-y-2">
                {items.map((item) => (
                    <Link
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 rounded-xl border border-(--card-stroke) bg-card hover:border-(--accent-2)/40 hover:bg-(--accent-2)/5 transition-all group"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] uppercase font-bold text-(--ink-muted) bg-(--card-90) px-1.5 py-0.5 rounded">
                                        {item.type}
                                    </span>
                                    <span className="text-xs font-mono text-(--ink-muted)">
                                        {item.id}
                                    </span>
                                </div>
                                <p className="text-sm font-medium text-foreground group-hover:text-(--accent-2) line-clamp-2">
                                    {item.title}
                                </p>
                            </div>
                            <span className="text-(--ink-muted) group-hover:text-(--accent-2) opacity-0 group-hover:opacity-100 transition-opacity">
                                ↗
                            </span>
                        </div>
                        {item.meta && (
                            <p className="mt-2 text-[11px] text-(--ink-muted)">
                                {item.meta}
                            </p>
                        )}
                    </Link>
                ))}
            </div>
        </section>
    );
}
