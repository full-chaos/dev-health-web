"use client";

type Action = {
    id: string;
    label: string;
    type: "experiment" | "process" | "tooling";
};

type SuggestedActionsProps = {
    actions: Action[];
};

/**
 * The next steps for the subject: the actions the API served, else the fixed suggestions of the
 * metric's definition. One plain section of rows, as the other sections of the drawer.
 */
export function SuggestedActions({ actions }: SuggestedActionsProps) {
    if (!actions || actions.length === 0) return null;

    return (
        <section
            data-testid="evidence-next-steps"
            aria-labelledby="evidence-next-steps-title"
            className="rounded-(--radius-md) border border-(--card-stroke) p-4"
        >
            <h4 id="evidence-next-steps-title" className="text-sm font-semibold text-foreground">
                Recommended next steps
            </h4>
            <ul className="mt-2 text-xs">
                {actions.map((action) => (
                    <li
                        key={action.id}
                        className="border-b border-(--card-stroke) py-2.5 text-(--ink-muted) last:border-b-0"
                    >
                        {action.label}
                    </li>
                ))}
            </ul>
        </section>
    );
}
