"use client";

import React from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { STATUS_PILL } from "@/lib/statusPill";

import { AdminTabs, useAdminNav } from "./AdminTabs";

type AdminHeaderProps = {
    title: string;
    description?: string;
    /** A status badge drawn beside the title (the title adornment slot), after the Platform admin pill. */
    titleBadge?: React.ReactNode;
    /** Page actions (right-aligned). */
    children?: React.ReactNode;
};

/**
 * The header of an Admin page: the shared `PageHeader` (title, description, actions), the
 * "Platform Admin" pill for a platform admin, and the tab row of the page's Admin destination
 * (AD-1 option A). The trail and the eyebrow come from the shell; there is no in-page trail.
 * On a page outside the Admin tab routes (the platform admin pages) the tab row renders nothing.
 */
export function AdminHeader({ title, description, titleBadge, children }: AdminHeaderProps) {
    const { isPlatformAdmin } = useAdminNav();

    return (
        <div className="flex flex-col gap-4">
            <PageHeader
                title={title}
                subtitle={description}
                actions={children}
                titleAdornment={
                    isPlatformAdmin || titleBadge ? (
                        <div className="flex flex-wrap items-center gap-2">
                            {isPlatformAdmin ? (
                                <span
                                    className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_PILL.muted}`}
                                >
                                    Platform admin
                                </span>
                            ) : null}
                            {titleBadge}
                        </div>
                    ) : undefined
                }
            />
            <AdminTabs />
        </div>
    );
}
