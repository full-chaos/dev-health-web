"use client";

type Action = {
    id: string;
    label: string;
    type: "experiment" | "process" | "tooling";
};

type SuggestedActionsProps = {
    actions: Action[];
};

export function SuggestedActions({ actions }: SuggestedActionsProps) {
    if (!actions || actions.length === 0) return null;

    return (
        <section className="space-y-3 rounded-2xl border border-(--card-stroke) bg-(--card-90) p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                Recommended next steps
            </p>
            <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                    <div
                        key={action.id}
                        className="rounded-full border border-(--accent)/20 bg-(--accent)/5 px-3 py-1.5 text-xs font-medium text-(--accent)"
                    >
                        {action.label}
                    </div>
                ))}
            </div>
        </section>
    );
}
