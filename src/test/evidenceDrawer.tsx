/**
 * Render helper for a component that calls `useEvidenceDrawer()`.
 * It mounts the same provider as the `(app)` layout, so the test opens the real shared drawer.
 * A test that mocks `next/navigation` must also give `usePathname`.
 */
import { render, type RenderOptions } from "@testing-library/react";
import { type ReactElement } from "react";

import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawerProvider";

export function renderWithEvidenceDrawer(
    ui: ReactElement,
    options?: Omit<RenderOptions, "wrapper">,
) {
    return render(ui, { wrapper: EvidenceDrawerProvider, ...options });
}
