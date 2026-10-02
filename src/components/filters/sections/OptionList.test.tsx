import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/utils";
import { toggleValue } from "../filterBarUtils";

import { OptionList } from "./OptionList";

const props = { emptyLabel: "All", items: ["feature", "maintenance"], toggleValue };

describe("OptionList (CHAOS-7784)", () => {
    it("multi-select by default: checkboxes that add and remove values", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<OptionList {...props} onChange={onChange} selected={["feature"]} />);

        expect(screen.getAllByRole("checkbox")).toHaveLength(3);
        await user.click(screen.getByRole("checkbox", { name: "maintenance" }));
        expect(onChange).toHaveBeenCalledWith(["feature", "maintenance"]);
    });

    it("single-select: radios, choosing a value replaces the selection, All clears it", async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<OptionList {...props} onChange={onChange} selected={["feature"]} single />);

        expect(screen.queryByRole("checkbox")).toBeNull();
        expect(screen.getAllByRole("radio")).toHaveLength(3);
        expect(screen.getByRole("radio", { name: "feature" })).toBeChecked();

        await user.click(screen.getByRole("radio", { name: "maintenance" }));
        expect(onChange).toHaveBeenLastCalledWith(["maintenance"]);

        await user.click(screen.getByRole("radio", { name: "All" }));
        expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("single-select marks only the first value when the URL holds several", () => {
        render(
            <OptionList
                {...props}
                onChange={vi.fn()}
                selected={["maintenance", "feature"]}
                single
            />,
        );
        expect(screen.getByRole("radio", { name: "maintenance" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "feature" })).not.toBeChecked();
    });
});
