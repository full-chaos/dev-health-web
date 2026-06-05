import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { SSRData, SSRExchange } from "@urql/core";
import { HydrateUrqlResults } from "../HydrateUrqlResults";

const restoreData = vi.fn();
let useSsrReturn: SSRExchange | null = null;

vi.mock("../provider", () => ({
    useSsr: () => useSsrReturn,
}));

function makeSsrExchange(): SSRExchange {
    return {
        restoreData,
        extractData: vi.fn(() => ({}) as SSRData),
    } as unknown as SSRExchange;
}

describe("HydrateUrqlResults", () => {
    beforeEach(() => {
        restoreData.mockClear();
        useSsrReturn = makeSsrExchange();
    });

    it("calls restoreData once with the payload on first render", () => {
        const payload: SSRData = {
            "123": {
                data: JSON.stringify({ analytics: { breakdowns: [] } }),
                hasNext: false,
            },
        };
        render(<HydrateUrqlResults payload={payload} />);
        expect(restoreData).toHaveBeenCalledTimes(1);
        expect(restoreData).toHaveBeenCalledWith(payload);
    });

    it("does not call restoreData when payload is null", () => {
        render(<HydrateUrqlResults payload={null} />);
        expect(restoreData).not.toHaveBeenCalled();
    });

    it("does not call restoreData when payload is undefined", () => {
        render(<HydrateUrqlResults payload={undefined} />);
        expect(restoreData).not.toHaveBeenCalled();
    });

    it("does not call restoreData when ssr context is null (outside provider)", () => {
        useSsrReturn = null;
        const payload: SSRData = { "123": { data: "{}", hasNext: false } };
        render(<HydrateUrqlResults payload={payload} />);
        expect(restoreData).not.toHaveBeenCalled();
    });

    it("calls restoreData exactly once across re-renders (idempotent)", () => {
        const payload: SSRData = { "123": { data: "{}", hasNext: false } };
        const { rerender } = render(<HydrateUrqlResults payload={payload} />);
        rerender(<HydrateUrqlResults payload={payload} />);
        rerender(<HydrateUrqlResults payload={payload} />);
        expect(restoreData).toHaveBeenCalledTimes(1);
    });

    it("renders null (no DOM output)", () => {
        const payload: SSRData = { "123": { data: "{}", hasNext: false } };
        const { container } = render(<HydrateUrqlResults payload={payload} />);
        expect(container.firstChild).toBeNull();
    });
});
