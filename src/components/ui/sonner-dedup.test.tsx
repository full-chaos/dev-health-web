import { describe, expect, it } from "vitest";
import { toast } from "sonner";
import { act, renderWithToaster, screen, waitFor } from "@/test/utils";

describe("sonner de-dup guard", () => {
    it("renders one DOM node per toast.error call", async () => {
        renderWithToaster(<div />);
        act(() => {
            toast.error("dedup-error");
        });
        await waitFor(() => expect(screen.getAllByText("dedup-error")).toHaveLength(1));
    });

    it("renders one DOM node per toast.success and toast.promise call", async () => {
        renderWithToaster(<div />);
        act(() => {
            toast.success("dedup-success");
            void toast.promise(Promise.resolve("x"), {
                loading: "dedup-loading",
                success: "dedup-promise-done",
            });
        });
        await waitFor(() => expect(screen.getAllByText("dedup-success")).toHaveLength(1));
        await waitFor(() => expect(screen.getAllByText("dedup-promise-done")).toHaveLength(1));
    });

    it("starts with no active toasts left over from earlier tests", () => {
        expect(toast.getToasts()).toHaveLength(0);
    });
});
