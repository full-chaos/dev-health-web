import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { SetupExamplesTabs } from "./SetupExamplesTabs";

describe("SetupExamplesTabs", () => {
    it("renders all 5 tabs and they are clickable", async () => {
        const user = userEvent.setup();
        render(<SetupExamplesTabs sourceSystem="github" sourceInstance="acme/api" />);

        for (const label of [
            "GitHub Actions",
            "GitLab Runner",
            "Generic Docker",
            "cURL",
            "Webhook relay",
        ]) {
            expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
        }

        await user.click(screen.getByRole("button", { name: /cURL/ }));
        expect(screen.getByText(/\/api\/v1\/external-ingest\/batches/)).toBeInTheDocument();
    });

    it("shows the Experimental badge only on the webhook relay tab", () => {
        render(<SetupExamplesTabs sourceSystem="github" sourceInstance="acme/api" />);
        expect(screen.getByText("Experimental")).toBeInTheDocument();
    });

    it("copies the active tab's code to the clipboard", async () => {
        const user = userEvent.setup();
        const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
        render(<SetupExamplesTabs sourceSystem="github" sourceInstance="acme/api" />);
        await user.click(screen.getByRole("button", { name: "Copy" }));
        expect(writeText).toHaveBeenCalled();
        expect(writeText.mock.calls[0][0]).toContain("dev-hops push export github");
    });
});
