"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FilterPills, type FilterPillOption } from "@/components/shared/FilterPills";
import {
    decodeSecurityFilter,
    encodeSecurityFilter,
    type SecurityFilter,
    type SecuritySeverity,
    type SecuritySource,
    type SecurityState,
} from "@/lib/filters/security";

type SeverityFilterValue = "all" | "multiple" | SecuritySeverity;
type SourceFilterValue = "all" | "multiple" | SecuritySource;
type StateFilterValue = "all" | "open" | "multiple" | SecurityState;

const SEVERITY_OPTIONS: FilterPillOption<SeverityFilterValue>[] = [
    { id: "all", label: "All" },
    { id: "critical", label: "Critical" },
    { id: "high", label: "High" },
    { id: "medium", label: "Medium" },
    { id: "low", label: "Low" },
    { id: "unknown", label: "Unknown" },
];

const STATE_OPTIONS: FilterPillOption<StateFilterValue>[] = [
    { id: "open", label: "Open" },
    { id: "all", label: "All" },
    { id: "fixed", label: "Fixed" },
    { id: "dismissed", label: "Dismissed" },
    { id: "detected", label: "Detected" },
    { id: "confirmed", label: "Confirmed" },
    { id: "resolved", label: "Resolved" },
];

const SOURCE_OPTIONS: FilterPillOption<SourceFilterValue>[] = [
    { id: "all", label: "All" },
    { id: "dependabot", label: "Dependabot" },
    { id: "code_scanning", label: "Code scanning" },
    { id: "advisory", label: "Advisory" },
    { id: "gitlab_vulnerability", label: "GitLab vulnerability" },
    { id: "gitlab_dependency", label: "GitLab dependency" },
];

const multipleOption = (count: number): FilterPillOption<"multiple"> => ({
    id: "multiple",
    label: `Multiple (${count})`,
    title: "Multiple values active — pick one to replace, or All to clear",
});

interface SecurityFilterBarWrapperProps {
    encodedFilter?: string;
}

export function SecurityFilterBarWrapper({ encodedFilter }: SecurityFilterBarWrapperProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const filter = encodedFilter
        ? decodeSecurityFilter(encodedFilter)
        : decodeSecurityFilter(searchParams.get("f") ?? undefined);

    const replaceFilter = useCallback(
        (nextFilter: SecurityFilter) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("f", encodeSecurityFilter(nextFilter));
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    const severityCount = filter.severities?.length ?? 0;
    const stateCount = filter.states?.length ?? 0;
    const sourceCount = filter.sources?.length ?? 0;

    const severityValue: SeverityFilterValue =
        filter.severities?.length === 1
            ? filter.severities[0]
            : severityCount > 1
              ? "multiple"
              : "all";
    const stateValue: StateFilterValue = filter.openOnly
        ? "open"
        : filter.states?.length === 1
          ? filter.states[0]
          : stateCount > 1
            ? "multiple"
            : "all";
    const sourceValue: SourceFilterValue =
        filter.sources?.length === 1 ? filter.sources[0] : sourceCount > 1 ? "multiple" : "all";

    const severityOptions: FilterPillOption<SeverityFilterValue>[] =
        severityCount > 1 ? [multipleOption(severityCount), ...SEVERITY_OPTIONS] : SEVERITY_OPTIONS;
    const stateOptions: FilterPillOption<StateFilterValue>[] =
        stateCount > 1 && !filter.openOnly
            ? [multipleOption(stateCount), ...STATE_OPTIONS]
            : STATE_OPTIONS;
    const sourceOptions: FilterPillOption<SourceFilterValue>[] =
        sourceCount > 1 ? [multipleOption(sourceCount), ...SOURCE_OPTIONS] : SOURCE_OPTIONS;

    const setSeverity = (value: SeverityFilterValue) => {
        const next = { ...filter };
        if (value === "all" || value === "multiple") {
            delete next.severities;
        } else {
            next.severities = [value];
        }
        replaceFilter(next);
    };

    const setState = (value: StateFilterValue) => {
        const next = { ...filter };
        if (value === "open") {
            next.openOnly = true;
            delete next.states;
        } else if (value === "all" || value === "multiple") {
            next.openOnly = false;
            delete next.states;
        } else {
            next.openOnly = false;
            next.states = [value];
        }
        replaceFilter(next);
    };

    const setSource = (value: SourceFilterValue) => {
        const next = { ...filter };
        if (value === "all" || value === "multiple") {
            delete next.sources;
        } else {
            next.sources = [value];
        }
        replaceFilter(next);
    };

    return (
        <section
            aria-label="Security filters"
            className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-4"
            data-testid="security-filter-bar"
        >
            <div className="flex flex-col gap-3">
                <FilterPills
                    options={severityOptions}
                    value={severityValue}
                    onChange={setSeverity}
                    ariaLabel="Security severity"
                    leadingLabel="Severity"
                />
                <FilterPills
                    options={stateOptions}
                    value={stateValue}
                    onChange={setState}
                    ariaLabel="Security state"
                    leadingLabel="State"
                />
                <FilterPills
                    options={sourceOptions}
                    value={sourceValue}
                    onChange={setSource}
                    ariaLabel="Security source"
                    leadingLabel="Source"
                />
            </div>
        </section>
    );
}
