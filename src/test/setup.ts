import "@testing-library/jest-dom";
import { afterEach } from "vitest";
import { toast } from "sonner";

// sonner >= 2.0.8 replays still-active toasts to every newly mounted <Toaster/>;
// its toast store is module-global, so dismiss between tests to avoid cross-test duplicates.
afterEach(() => {
    toast.dismiss();
});
