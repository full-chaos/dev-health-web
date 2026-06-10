import { describe, it, expect, vi, beforeEach } from "vitest";

import { renderHook } from "@testing-library/react";

import { useActiveLens, useActiveRole } from "../lensContext.client";

let search = "";

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(search),
}));

describe("useActiveRole (lens-aware, CHAOS-2249)", () => {
    beforeEach(() => {
        search = "";
    });

    it("defaults to the default role when no lens or role param is set", () => {
        const { result } = renderHook(() => useActiveRole());
        expect(result.current).toBe("ic");
    });

    it("follows the lens= param (the Lens control's canonical param)", () => {
        search = "lens=pm";
        const { result } = renderHook(() => useActiveRole());
        expect(result.current).toBe("pm");
    });

    it("still honours legacy role= as an alias", () => {
        search = "role=em";
        const { result } = renderHook(() => useActiveRole());
        expect(result.current).toBe("em");
    });

    it("prefers lens= over a stale legacy role=", () => {
        search = "lens=leadership&role=ic";
        const { result } = renderHook(() => useActiveRole());
        expect(result.current).toBe("leadership");
    });

    it("maps the neutral lens to the default role", () => {
        search = "lens=neutral";
        const { result } = renderHook(() => useActiveRole());
        expect(result.current).toBe("ic");
    });
});

describe("useActiveLens", () => {
    it("returns neutral when nothing is set", () => {
        search = "";
        const { result } = renderHook(() => useActiveLens());
        expect(result.current).toBe("neutral");
    });

    it("reads the lens param", () => {
        search = "lens=em";
        const { result } = renderHook(() => useActiveLens());
        expect(result.current).toBe("em");
    });
});
