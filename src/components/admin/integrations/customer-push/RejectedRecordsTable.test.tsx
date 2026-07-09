import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { RejectedRecordsTable } from "./RejectedRecordsTable";

describe("RejectedRecordsTable", () => {
    it("shows the green empty state when there are no rejected records", () => {
        render(<RejectedRecordsTable records={[]} />);
        expect(screen.getByText("No rejected records.")).toBeInTheDocument();
    });

    it("renders index/kind/external_id/code/path/message columns for each record", () => {
        render(
            <RejectedRecordsTable
                records={[
                    {
                        index: 12,
                        kind: "pull_request.v1",
                        external_id: "PR#88",
                        code: "missing_external_id",
                        path: "records[12].externalId",
                        message: "externalId is required",
                    },
                ]}
            />,
        );
        expect(screen.getByRole("columnheader", { name: "Index" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: "Path" })).toBeInTheDocument();
        expect(screen.getByText("PR#88")).toBeInTheDocument();
        expect(screen.getByText("missing_external_id")).toBeInTheDocument();
        expect(screen.getByText("externalId is required")).toBeInTheDocument();
    });

    it("renders a dash for a null path or external_id (both nullable on the real backend)", () => {
        render(
            <RejectedRecordsTable
                records={[
                    {
                        index: 1,
                        kind: "work_item.v1",
                        external_id: null,
                        code: "unsupported_kind_for_system",
                        path: null,
                        message: "not supported",
                    },
                ]}
            />,
        );
        const dashes = screen.getAllByText("—");
        expect(dashes.length).toBe(2);
    });
});
