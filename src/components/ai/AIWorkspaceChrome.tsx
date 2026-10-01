"use client";

import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { BackLink } from "@/components/shared/BackLink";
import { useInShell } from "@/components/shell/ShellContext";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { AITabNav } from "./AITabNav";

/**
 * Chrome of the AI area for the pages that are not in the shared app shell yet:
 * navigation, `<main>`, the area header and the AI tab strip.
 *
 * On a route in the shared app shell the layout owns the navigation and
 * `<main>`, and the page brings its own header: this renders the page only. It
 * lets the AI pages move one at a time; it is deleted when the last has moved.
 */
export function AIWorkspaceChrome({ children }: { children: ReactNode }) {
    const inShell = useInShell();
    const searchParams = useSearchParams();

    const { filters, role } = useMemo(() => {
        const encoded = searchParams.get("f");
        const roleParam = searchParams.get("role") ?? undefined;

        if (encoded) {
            return { filters: decodeFilter(encoded), role: roleParam };
        }

        const params: Record<string, string> = {};
        searchParams.forEach((value, key) => {
            params[key] = value;
        });
        return { filters: filterFromQueryParams(params), role: roleParam };
    }, [searchParams]);

    if (inShell) {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="ai" role={role} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-col gap-4">
                        <BackLink href={withFilterParam("/", filters, role)} />
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                AI
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">AI</h1>
                            <p className="mt-2 max-w-3xl text-sm text-(--ink-muted)">
                                What AI appears to change across delivery, review, quality, and
                                governance. Open an evidence-backed view for the selected window.
                            </p>
                        </div>
                    </header>
                    <AITabNav filters={filters} role={role} />
                    {children}
                </main>
            </div>
        </div>
    );
}
