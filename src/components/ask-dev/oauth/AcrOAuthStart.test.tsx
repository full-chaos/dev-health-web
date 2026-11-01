import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.hoisted(() => ({ value: "return=%2Fdev%3Fthread%3Dt1" }));
vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(search.value),
}));

const begin = vi.fn();
vi.mock("@/lib/ask-dev/acr-auth", () => ({
    beginAcrAuthorization: (returnTo: string) => begin(returnTo),
}));

import { AcrOAuthStart } from "./AcrOAuthStart";

beforeEach(() => {
    begin.mockReset();
    search.value = "return=%2Fdev%3Fthread%3Dt1";
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("AcrOAuthStart", () => {
    it("tells an impersonating admin that Ask Dev is not available, with a way back (CHAOS-12306)", async () => {
        begin.mockResolvedValue({ kind: "impersonating" });
        render(<AcrOAuthStart />);
        expect(
            await screen.findByRole("heading", {
                name: "Ask Dev is not available while impersonating",
            }),
        ).toBeVisible();
        expect(begin).toHaveBeenCalledWith("/dev?thread=t1");
        expect(screen.getByRole("status")).toHaveTextContent(
            "Stop impersonating to connect Ask Dev.",
        );
        expect(screen.getByTestId("ask-dev-acr-start")).toHaveAttribute(
            "data-state",
            "impersonating",
        );
        expect(screen.getByRole("link", { name: "Return to Ask Dev" })).toHaveAttribute(
            "href",
            "/dev?thread=t1",
        );
        // Trying again cannot help while the impersonation lasts.
        expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    });
});
