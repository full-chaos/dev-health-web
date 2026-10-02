import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { STATUS_PILL } from "@/lib/statusPill";
import type { FeatureFlagListItem } from "@/lib/feature-flags/types";

import { FeatureFlagTable } from "./FeatureFlagTable";

const flag = (flagKey: string, isActive: boolean | null): FeatureFlagListItem =>
    ({
        flagId: flagKey,
        flagKey,
        provider: "launchdarkly",
        createdAt: null,
        lastToggledAt: null,
        isActive,
    }) as FeatureFlagListItem;

describe("FeatureFlagTable status", () => {
    it("shows ON, OFF and Unknown as three different states", () => {
        render(
            <FeatureFlagTable
                initialData={{
                    items: [flag("a", true), flag("b", false), flag("c", null)],
                    totalCount: 3,
                    hasNextPage: false,
                }}
                fetchAction={vi.fn()}
            />,
        );

        const statuses = screen.getAllByTestId("flag-status");
        expect(statuses.map((el) => el.textContent)).toEqual(["ON", "OFF", "Unknown"]);
        expect(statuses[0].className).toContain(STATUS_PILL.positive);
        expect(statuses[1].className).toContain(STATUS_PILL.negative);
        expect(statuses[2].className).toContain(STATUS_PILL.muted);
        expect(statuses[2].className).not.toContain(STATUS_PILL.negative);
        expect(screen.queryByText("--", { selector: "[data-testid=flag-status]" })).toBeNull();
    });
});
