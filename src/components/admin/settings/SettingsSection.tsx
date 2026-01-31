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
          ? "border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-900/10"
          : "border-(--card-stroke) bg-(--card)"
      }`}
    >
      <div className="mb-6">
        <h2
          className={`text-lg font-semibold ${
            danger ? "text-red-900 dark:text-red-200" : "text-(--foreground)"
          }`}
        >
          {title}
        </h2>
        <p
          className={`mt-1 text-sm ${
            danger ? "text-red-700 dark:text-red-300" : "text-(--ink-muted)"
          }`}
        >
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}
