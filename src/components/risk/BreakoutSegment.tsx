"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SegmentedControl } from "@/components/shared/SegmentedControl";

import type { CompoundingRiskScope } from "./CompoundingRiskDashboard";

const OPTIONS: Array<{ id: CompoundingRiskScope; label: string }> = [
    { id: "repo", label: "By repo" },
    { id: "team", label: "By team" },
];

/**
 * "By repo / By team" for the existing `breakout` URL param, drawn as the shared segmented control
 * (concept `govern-compounding-risk`). Choosing an option goes to the same page with every other
 * param kept (`f`, `role`, `origin`); only `breakout` changes, so the view stays deep-linkable.
 * There is no person option: this surface is a team and repo signal.
 */
export function BreakoutSegment({ breakout }: { breakout: CompoundingRiskScope }) {
    const router = useRouter();
    const pathname = usePathname() ?? "/risk/compounding";
    const searchParams = useSearchParams();

    const hrefFor = (value: CompoundingRiskScope) => {
        const next = new URLSearchParams(searchParams?.toString() ?? "");
        next.set("breakout", value);
        return `${pathname}?${next.toString()}`;
    };

    return (
        <SegmentedControl
            ariaLabel="Breakout"
            testId="breakout-segment"
            options={OPTIONS}
            value={breakout}
            onChange={(value) => {
                if (value !== breakout) router.push(hrefFor(value), { scroll: false });
            }}
        />
    );
}
