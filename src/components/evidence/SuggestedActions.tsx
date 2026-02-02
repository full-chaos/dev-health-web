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
        <section className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                Suggested Actions
            </p>
            <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                    <div
                        key={action.id}
                        className="px-3 py-1.5 rounded-full border border-(--accent-2)/20 bg-(--accent-2)/5 text-xs text-(--accent-2) font-medium"
                    >
                        {action.label}
                    </div>
                ))}
            </div>
        </section>
    );
}
