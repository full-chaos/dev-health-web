import React from "react";
import { Breadcrumbs, type Crumb } from "@/components/Breadcrumbs";

type AdminHeaderProps = {
    title: string;
    description?: string;
    children?: React.ReactNode;
    /** Location trail (section → page). Rendered above the title. */
    breadcrumbs?: Crumb[];
};

export function AdminHeader({ title, description, children, breadcrumbs }: AdminHeaderProps) {
    const headerClassName = children
        ? "mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:pr-36"
        : "mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between";

    return (
        <header className={headerClassName}>
            <div>
                {breadcrumbs && breadcrumbs.length > 0 ? (
                    <div className="mb-3">
                        <Breadcrumbs items={breadcrumbs} />
                    </div>
                ) : null}
                <h1 className="font-(--font-display) text-2xl font-bold">{title}</h1>
                {description && <p className="mt-1 text-sm text-(--ink-muted)">{description}</p>}
            </div>
            {children && <div className="flex items-center gap-3">{children}</div>}
        </header>
    );
}
