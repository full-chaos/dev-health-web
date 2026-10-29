import { beforeEach, describe, expect, it, vi } from "vitest";

import { claimRightDrawer, releaseRightDrawer, resetRightDrawerForTest } from "./rightDrawer";

beforeEach(resetRightDrawerForTest);

describe("one right drawer at a time", () => {
    it("closes the previous owner when another owner claims the edge", () => {
        const closeEvidence = vi.fn();
        const closeAskDev = vi.fn();
        claimRightDrawer("evidence", closeEvidence);

        claimRightDrawer("ask-dev", closeAskDev);

        expect(closeEvidence).toHaveBeenCalledTimes(1);
        expect(closeAskDev).not.toHaveBeenCalled();
    });

    it("does not close an owner that claims again", () => {
        const close = vi.fn();
        claimRightDrawer("filters", close);

        claimRightDrawer("filters", close);

        expect(close).not.toHaveBeenCalled();
    });

    it("does not close an owner that released the edge", () => {
        const closeFilters = vi.fn();
        claimRightDrawer("filters", closeFilters);
        releaseRightDrawer("filters");

        claimRightDrawer("ask-dev", vi.fn());

        expect(closeFilters).not.toHaveBeenCalled();
    });

    it("ignores a release by an owner that does not hold the edge", () => {
        const closeAskDev = vi.fn();
        claimRightDrawer("ask-dev", closeAskDev);
        releaseRightDrawer("evidence");

        claimRightDrawer("filters", vi.fn());

        expect(closeAskDev).toHaveBeenCalledTimes(1);
    });
});
