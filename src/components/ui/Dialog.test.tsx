import { describe, it, expect } from "vitest";

import { Dialog } from "./Dialog";
import { Drawer } from "./Drawer";
import { render, screen } from "@/test/utils";

describe("modal chrome mounts at document.body", () => {
    it("Dialog is not rendered inside its parent, so no ancestor can contain its backdrop", () => {
        const { container } = render(
            <div data-testid="blurred-ancestor" className="backdrop-blur-sm">
                <Dialog open onCloseAction={() => {}} title="Search">
                    <p>body</p>
                </Dialog>
            </div>,
        );
        const backdrop = screen.getByTestId("dialog-backdrop");
        expect(container.contains(backdrop)).toBe(false);
        expect(backdrop.parentElement?.parentElement).toBe(document.body);
    });

    it("Drawer is not rendered inside its parent", () => {
        const { container } = render(
            <div className="backdrop-blur-sm">
                <Drawer open onCloseAction={() => {}} title="Evidence">
                    <p>body</p>
                </Drawer>
            </div>,
        );
        const backdrop = screen.getByTestId("drawer-backdrop");
        expect(container.contains(backdrop)).toBe(false);
        expect(backdrop.parentElement?.parentElement).toBe(document.body);
    });
});
