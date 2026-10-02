import { useRef, useState } from "react";
import { describe, it, expect, vi } from "vitest";

import { Drawer } from "./Drawer";
import { render, screen, userEvent, fireEvent } from "@/test/utils";

function Harness({ onEscapeMenu }: { onEscapeMenu?: () => void }) {
    const [open, setOpen] = useState(false);
    const [menu, setMenu] = useState(false);
    return (
        <div>
            <button type="button" onClick={() => setOpen(true)}>
                Open evidence
            </button>
            <Drawer
                open={open}
                onCloseAction={() => setOpen(false)}
                title="Evidence"
                eyebrow="Linked incident"
                footer={<button type="button">Open in Explore</button>}
            >
                <button type="button" onClick={() => setMenu(true)}>
                    Menu
                </button>
                {menu && (
                    <div
                        role="menu"
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                e.preventDefault();
                                setMenu(false);
                                onEscapeMenu?.();
                            }
                        }}
                    >
                        <button role="menuitem" type="button">
                            Item
                        </button>
                    </div>
                )}
            </Drawer>
        </div>
    );
}

describe("Drawer", () => {
    it("renders nothing when closed", () => {
        render(
            <Drawer open={false} onCloseAction={() => {}} title="T">
                x
            </Drawer>,
        );
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("is a modal dialog labelled by its title, with eyebrow, body and footer", () => {
        render(
            <Drawer
                open
                onCloseAction={() => {}}
                title="Evidence"
                eyebrow="Linked incident"
                footer={<a href="#e">Go</a>}
            >
                body text
            </Drawer>,
        );
        const dialog = screen.getByRole("dialog", { name: "Evidence" });
        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(screen.getByText("Linked incident")).toBeInTheDocument();
        expect(screen.getByText("body text")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Go" })).toBeInTheDocument();
    });

    it("uses the wide size on request", () => {
        render(
            <Drawer open onCloseAction={() => {}} title="T" size="wide">
                x
            </Drawer>,
        );
        expect(screen.getByRole("dialog")).toHaveAttribute("data-size", "wide");
        expect(screen.getByRole("dialog").className).toContain("sm:w-195");
    });

    it("has an icon-only close control: no visible text, a decorative icon, the name 'Close'", () => {
        render(
            <Drawer open onCloseAction={() => {}} title="T">
                <p>body</p>
            </Drawer>,
        );
        const close = screen.getByRole("button", { name: "Close" });
        expect(close).toHaveAttribute("aria-label", "Close");
        expect(close.textContent).toBe("");
        expect(close.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
        // Approved prototype `.btn.circle`: a 35px square.
        expect(close.className).toContain("h-8.75");
        expect(close.className).toContain("w-8.75");
    });

    it("moves focus to Close on open and returns it to the opener on close", async () => {
        render(<Harness />);
        const opener = screen.getByRole("button", { name: "Open evidence" });
        await userEvent.click(opener);
        expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(opener).toHaveFocus();
    });

    it("keeps Tab and Shift+Tab inside the drawer", async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole("button", { name: "Open evidence" }));
        const close = screen.getByRole("button", { name: "Close" });
        const last = screen.getByRole("button", { name: "Open in Explore" });
        await userEvent.tab({ shift: true });
        expect(last).toHaveFocus();
        await userEvent.tab();
        expect(close).toHaveFocus();
    });

    it("closes on backdrop click, not on a click inside", async () => {
        const onClose = vi.fn();
        render(
            <Drawer open onCloseAction={onClose} title="T">
                <p>inside</p>
            </Drawer>,
        );
        await userEvent.click(screen.getByText("inside"));
        expect(onClose).not.toHaveBeenCalled();
        await userEvent.click(screen.getByTestId("drawer-backdrop"));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Escape closes an open menu inside the drawer first, not the drawer", async () => {
        const onEscapeMenu = vi.fn();
        render(<Harness onEscapeMenu={onEscapeMenu} />);
        await userEvent.click(screen.getByRole("button", { name: "Open evidence" }));
        await userEvent.click(screen.getByRole("button", { name: "Menu" }));
        screen.getByRole("menuitem", { name: "Item" }).focus();
        await userEvent.keyboard("{Escape}");
        expect(onEscapeMenu).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("menu")).toBeNull();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("locks page scroll while open and releases it on close and unmount", () => {
        document.body.style.overflow = "auto";
        const { rerender, unmount } = render(
            <Drawer open onCloseAction={() => {}} title="T">
                x
            </Drawer>,
        );
        expect(document.body.style.overflow).toBe("hidden");
        rerender(
            <Drawer open={false} onCloseAction={() => {}} title="T">
                x
            </Drawer>,
        );
        expect(document.body.style.overflow).toBe("auto");
        rerender(
            <Drawer open onCloseAction={() => {}} title="T">
                x
            </Drawer>,
        );
        unmount();
        expect(document.body.style.overflow).toBe("auto");
    });

    it("returns focus to a given returnFocusRef", async () => {
        function Ref() {
            const target = useRef<HTMLButtonElement>(null);
            const [open, setOpen] = useState(true);
            return (
                <div>
                    <button type="button" ref={target}>
                        Target
                    </button>
                    <Drawer
                        open={open}
                        onCloseAction={() => setOpen(false)}
                        title="T"
                        returnFocusRef={target}
                    >
                        x
                    </Drawer>
                </div>
            );
        }
        render(<Ref />);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.getByRole("button", { name: "Target" })).toHaveFocus();
    });
});
