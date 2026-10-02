import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    usePathname: () => "/",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

// The static demo export (DEMO_EXPORT=true) serves this module as "/". The export failed with
// "useEvidenceDrawer must be used inside EvidenceDrawerProvider" because the demo tree had no provider.
import DemoPage from "./page.demo";

describe("demo route (page.demo)", () => {
    it("renders the real demo page without throwing outside the (app) layout", () => {
        expect(() => render(<DemoPage />)).not.toThrow();
    });
});
