import React from "react";

type SettingsSectionProps = {
    title: string;
    description: string;
    children: React.ReactNode;
    danger?: boolean;
};

export function SettingsSection({ title, description, children, danger }: SettingsSectionProps) {
    return (
        <section
            className={`mb-8 rounded-lg border p-6 ${
                danger
                    ? "border-(--negative)/30 bg-(--negative)/12"
                    : "border-(--card-stroke) bg-(--card)"
            }`}
        >
            <div className="mb-6">
                <h2
                    className={`text-lg font-semibold ${
                        danger ? "text-(--negative)" : "text-(--foreground)"
                    }`}
                >
                    {title}
                </h2>
                <p
                    className={`mt-1 text-sm ${
                        danger ? "text-(--negative)" : "text-(--ink-muted)"
                    }`}
                >
                    {description}
                </p>
            </div>
            {children}
        </section>
    );
}
