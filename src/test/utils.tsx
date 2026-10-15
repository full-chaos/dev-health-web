/**
 * Custom render utilities for component tests.
 * Wraps components with necessary providers and mocks.
 */
import { render, type RenderOptions } from "@testing-library/react";
import { type ReactElement } from "react";
import { Toaster, toast } from "sonner";

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
    // sonner >= 2.0.8 replays still-active toasts to every newly mounted <Toaster/> and its
    // store is module-global, so drop toasts left by earlier tests to avoid duplicate nodes.
    toast.dismiss();
    return customRender(
        <>
            {ui}
            <Toaster />
        </>,
        options,
    );
}
