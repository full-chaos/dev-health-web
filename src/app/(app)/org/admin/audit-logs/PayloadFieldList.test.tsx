import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@/test/utils";
import { PayloadFieldList } from "./PayloadFieldList";

describe("PayloadFieldList", () => {
    afterEach(() => cleanup());

    it("shows the empty message when data is null", () => {
        render(
            <PayloadFieldList title="Change payload" data={null} emptyMessage="No payload returned." />,
        );
        expect(screen.getByText("No payload returned.")).toBeInTheDocument();
    });

    it("shows the empty message when data is an empty object", () => {
        render(
            <PayloadFieldList title="Change payload" data={{}} emptyMessage="No payload returned." />,
        );
        expect(screen.getByText("No payload returned.")).toBeInTheDocument();
    });

    it("renders each field as a humanized, labeled row instead of a raw dump", () => {
        render(
            <PayloadFieldList
                title="Change payload"
                data={{ old_role: "member", new_role: "admin" }}
                emptyMessage="No payload returned."
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
                title="Request context"
                data={{ is_automated: true, previous_value: null }}
                emptyMessage="No context returned."
            />,
        );
        expect(screen.getByText("Yes")).toBeInTheDocument();
        expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("stringifies a nested object as one field's leaf value", () => {
        render(
            <PayloadFieldList
                title="Change payload"
                data={{ role: { old: "member", new: "admin" } }}
                emptyMessage="No payload returned."
            />,
        );
        expect(screen.getByText('{"old":"member","new":"admin"}')).toBeInTheDocument();
    });
});
