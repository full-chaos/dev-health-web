import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@/test/utils";
import { PayloadFieldList } from "./PayloadFieldList";

describe("PayloadFieldList", () => {
    afterEach(() => cleanup());

    it("shows the empty message when data is null", () => {
        render(<PayloadFieldList title="Changes" data={null} emptyMessage="No changes recorded." />);
        expect(screen.getByText("No changes recorded.")).toBeInTheDocument();
    });

    it("shows the empty message when data is an empty object", () => {
        render(<PayloadFieldList title="Changes" data={{}} emptyMessage="No changes recorded." />);
        expect(screen.getByText("No changes recorded.")).toBeInTheDocument();
    });

    it("renders each flat field as a humanized, labeled row instead of a raw dump", () => {
        render(
            <PayloadFieldList
                title="Changes"
                data={{ old_role: "member", new_role: "admin" }}
                emptyMessage="No changes recorded."
            />,
        );
        expect(screen.getByText("Old Role")).toBeInTheDocument();
        expect(screen.getByText("member")).toBeInTheDocument();
        expect(screen.getByText("New Role")).toBeInTheDocument();
        expect(screen.getByText("admin")).toBeInTheDocument();
        expect(screen.queryByText(/"old_role":"member"/)).not.toBeInTheDocument();
    });

    it("formats booleans and null leaf values", () => {
        render(
            <PayloadFieldList
                title="Request details"
                data={{ is_automated: true, previous_value: null }}
                emptyMessage="No request details recorded."
            />,
        );
        expect(screen.getByText("Yes")).toBeInTheDocument();
        expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("flattens a nested object into dotted-path labeled rows instead of a raw dump", () => {
        render(
            <PayloadFieldList
                title="Changes"
                data={{ role: { old: "member", new: "admin" } }}
                emptyMessage="No changes recorded."
            />,
        );
        expect(screen.getByText("Role \u203A Old")).toBeInTheDocument();
        expect(screen.getByText("member")).toBeInTheDocument();
        expect(screen.getByText("Role \u203A New")).toBeInTheDocument();
        expect(screen.getByText("admin")).toBeInTheDocument();
        expect(screen.queryByText(/"old":"member"/)).not.toBeInTheDocument();
    });

    it("renders an array of primitives as comma-joined text", () => {
        render(
            <PayloadFieldList
                title="Changes"
                data={{ tags: ["urgent", "billing"] }}
                emptyMessage="No changes recorded."
            />,
        );
        expect(screen.getByText("Tags")).toBeInTheDocument();
        expect(screen.getByText("urgent, billing")).toBeInTheDocument();
    });

    it("summarizes an array of objects as a count instead of dumping them", () => {
        render(
            <PayloadFieldList
                title="Changes"
                data={{ members: [{ id: "1" }, { id: "2" }, { id: "3" }] }}
                emptyMessage="No changes recorded."
            />,
        );
        expect(screen.getByText("Members")).toBeInTheDocument();
        expect(screen.getByText("3 nested values")).toBeInTheDocument();
    });

    it("summarizes structures nested beyond the flattening depth instead of dumping them", () => {
        render(
            <PayloadFieldList
                title="Changes"
                data={{ a: { b: { c: { d: "x", e: "y" } } } }}
                emptyMessage="No changes recorded."
            />,
        );
        expect(screen.getByText("A \u203A B \u203A C")).toBeInTheDocument();
        expect(screen.getByText("2 nested values")).toBeInTheDocument();
    });
});
