import type { ReactNode } from "react";

type FormSectionProps = {
    title: string;
    description?: string;
    children: ReactNode;
};

/**
 * Visually distinct section shell for the sync config form (CHAOS-2797 IA
 * refactor). Nests inside the form's outer card, matching the app's
 * established section-card language (see PlanManager / SettingsSection).
 */
export function FormSection({ title, description, children }: FormSectionProps) {
    return (
        <section className="rounded-xl border border-(--card-stroke) bg-(--card) p-5">
            <div className="mb-4">
                <h2 className="text-sm font-semibold text-(--foreground)">{title}</h2>
                {description && <p className="mt-1 text-xs text-(--ink-muted)">{description}</p>}
            </div>
            <div className="space-y-4">{children}</div>
        </section>
    );
}
