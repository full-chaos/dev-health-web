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
        <section className="space-y-3 rounded-2xl border border-(--card-stroke) bg-(--card-90) p-4">
            <div className="flex items-center justify-between gap-3">
                <p className="text-label-caps uppercase tracking-[0.2em] text-(--ink-muted)">
                    Supporting Evidence
                </p>
                <span className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-label-caps text-(--ink-muted)">
                    {items.length} artifacts
                </span>
            </div>
            <div className="space-y-2">
                {items.map((item) => (
                    <Link
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group block rounded-xl border border-(--card-stroke) bg-background/35 p-3 transition-all hover:border-(--accent)/40 hover:bg-(--accent)/5"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="rounded border border-(--card-stroke) bg-(--card-70) px-1.5 py-0.5 text-label-caps font-bold uppercase text-(--ink-muted)">
                                        {item.type}
                                    </span>
                                </div>
                                <p className="line-clamp-2 text-sm font-medium leading-5 text-foreground group-hover:text-(--accent)">
                                    {item.title}
                                </p>
                            </div>
                            <span className="text-(--ink-muted) opacity-0 transition-opacity group-hover:text-(--accent) group-hover:opacity-100">
                                ↗
                            </span>
                        </div>
                        {item.meta && (
                            <p className="mt-2 text-xs leading-4 text-(--ink-muted)">{item.meta}</p>
                        )}
                    </Link>
                ))}
            </div>
        </section>
    );
}
