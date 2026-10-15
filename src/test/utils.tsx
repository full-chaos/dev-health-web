/**
 * Custom render utilities for component tests.
 * Wraps components with necessary providers and mocks.
 */
import { render, type RenderOptions } from "@testing-library/react";
import { type ReactElement } from "react";
import { afterEach } from "vitest";
import { Toaster, toast } from "sonner";

// sonner >= 2.0.8 replays still-active toasts to every newly mounted <Toaster/>;
// its toast store is module-global, so dismiss between tests to avoid cross-test duplicates.
afterEach(() => {
    toast.dismiss();
});

// Re-export everything from testing library for convenience
export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";

/** Minimal wrapper — add providers here as the app grows */
function Providers({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
    return render(ui, { wrapper: Providers, ...options });
}

export { customRender as render };

/**
 * Renders a component wrapped with <Toaster /> so toast assertions work.
 * Use this instead of bare `render()` for any component that calls `toast.*`.
 */
export function renderWithToaster(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
    return customRender(
        <>
            {ui}
            <Toaster />
        </>,
        options,
    );
}
