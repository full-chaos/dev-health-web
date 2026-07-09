import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { TruncatedId } from "./TruncatedId";

describe("TruncatedId", () => {
    it("renders a truncated value with the full id in the title attribute", () => {
        render(<TruncatedId value="12345678-abcd-ef00-0000-000000000000" label="Source ID" />);
        const span = screen.getByTitle("12345678-abcd-ef00-0000-000000000000");
        expect(span).toHaveTextContent("12345678…");
    });

    it("copies the full value to the clipboard on click", async () => {
        // user-event installs its own mock navigator.clipboard on setup();
        // spy on the method it installs rather than replacing
        // navigator.clipboard ourselves, or user-event's stub silently wins.
        const user = userEvent.setup();
        const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
        render(<TruncatedId value="abcdefgh-1111" label="Source ID" />);
        await user.click(screen.getByRole("button", { name: "Copy Source ID" }));
        expect(writeText).toHaveBeenCalledWith("abcdefgh-1111");
    });

    it("omits the copy button in readOnly mode", () => {
        render(<TruncatedId value="abcdefgh-1111" label="Ingestion ID" readOnly />);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
});
