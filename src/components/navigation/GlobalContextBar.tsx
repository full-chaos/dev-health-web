/**
 * GlobalContextBar — RSC + Client hybrid wrapper.
 *
 * The interactive controls read `useSearchParams()`, which deopts a static
 * build unless it sits inside a Suspense boundary. Mirroring the
 * FilterBar/FilterBarClient split keeps call sites server-renderable while the
 * client child owns the search-param + session wiring.
 */

import { Suspense } from "react";

import type { MetricFilter } from "@/lib/filters/types";
import { GlobalContextBarClient } from "./GlobalContextBarClient";

type GlobalContextBarProps = {
    filters: MetricFilter;
    origin?: string | null;
    orgName?: string;
};

export function GlobalContextBar({ filters, origin, orgName }: GlobalContextBarProps) {
    return (
        <Suspense fallback={<div className="h-14 animate-pulse rounded-2xl bg-(--card-80)" />}>
            <GlobalContextBarClient filters={filters} origin={origin} orgName={orgName} />
        </Suspense>
    );
}
