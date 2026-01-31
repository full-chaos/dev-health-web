import React from "react";

type AdminHeaderProps = {
  title: string;
  description?: string;
  children?: React.ReactNode;
};

export function AdminHeader({ title, description, children }: AdminHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="font-(--font-display) text-2xl font-bold">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-(--ink-muted)">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </header>
  );
}
