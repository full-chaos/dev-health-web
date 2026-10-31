import { describe, expect, it } from "vitest";
import { applyRowSelection } from "../rangeSelection";

const ORDER = ["a", "b", "c", "d", "e"];

describe("applyRowSelection", () => {
    it("plain click toggles one row and sets the anchor", () => {
        expect(
            applyRowSelection({ selected: [], order: ORDER, anchor: null, key: "c", shift: false }),
        ).toEqual({
            selected: ["c"],
            anchor: "c",
        });
        expect(
            applyRowSelection({
                selected: ["c", "a"],
                order: ORDER,
                anchor: "c",
                key: "c",
                shift: false,
            }),
        ).toEqual({
            selected: ["a"],
            anchor: "c",
        });
    });

    it("shift-click selects the forward range inclusive", () => {
        const result = applyRowSelection({
            selected: ["b"],
            order: ORDER,
            anchor: "b",
            key: "d",
            shift: true,
        });
        expect(result.selected.sort()).toEqual(["b", "c", "d"]);
        expect(result.anchor).toBe("d");
    });

    it("shift-click selects the backward range inclusive", () => {
        const result = applyRowSelection({
            selected: ["d"],
            order: ORDER,
            anchor: "d",
            key: "b",
            shift: true,
        });
        expect(result.selected.sort()).toEqual(["b", "c", "d"]);
    });

    it("shift-click takes the state of the second click (deselect)", () => {
        const result = applyRowSelection({
            selected: ["a", "b", "c", "d"],
            order: ORDER,
            anchor: "a",
            key: "c",
            shift: true,
        });
        expect(result.selected).toEqual(["d"]);
    });

    it("shift-click without an anchor acts like a plain click", () => {
        expect(
            applyRowSelection({ selected: [], order: ORDER, anchor: null, key: "c", shift: true }),
        ).toEqual({
            selected: ["c"],
            anchor: "c",
        });
    });

    it("anchor resets after a plain click", () => {
        const first = applyRowSelection({
            selected: [],
            order: ORDER,
            anchor: null,
            key: "a",
            shift: false,
        });
        const second = applyRowSelection({ ...first, order: ORDER, key: "d", shift: false });
        const third = applyRowSelection({ ...second, order: ORDER, key: "e", shift: true });
        expect(third.selected.sort()).toEqual(["a", "d", "e"]);
    });
});
