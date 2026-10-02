import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RetryButton } from "./RetryButton";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("RetryButton", () => {
    it("re-runs the server render when clicked", async () => {
        render(<RetryButton />);
        await userEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(refresh).toHaveBeenCalledTimes(1);
    });
});
