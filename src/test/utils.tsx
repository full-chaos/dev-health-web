/**
 * Custom render utilities for component tests.
 * Wraps components with necessary providers and mocks.
 */
import { render, type RenderOptions } from "@testing-library/react";
import { type ReactElement } from "react";
import { Toaster } from "sonner";

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
export function renderWithToaster(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  function ToasterWrapper({ children }: { children: React.ReactNode }) {
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  }

  return render(ui, { wrapper: ToasterWrapper, ...options });
}
