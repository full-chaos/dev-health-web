import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { RejectedRecordsTable } from "./RejectedRecordsTable";

describe("RejectedRecordsTable", () => {
    it("renders a green empty state when there are no rejected records", () => {
        const { container } = render(<RejectedRecordsTable records={[]} />);
        expect(screen.getByText("No rejected records.")).toBeInTheDocument();
        expect(container.querySelector(".text-green-600")).toBeInTheDocument();
    });

    it("renders index/kind/external_id/path/message columns for each record", () => {
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
        expect(screen.getByText("12")).toBeInTheDocument();
        expect(screen.getByText("pull_request.v1")).toBeInTheDocument();
        expect(screen.getByText("PR#88")).toBeInTheDocument();
        expect(screen.getByText("missing_external_id")).toBeInTheDocument();
        expect(screen.getByText("records[12].externalId")).toBeInTheDocument();
        expect(screen.getByText("externalId is required")).toBeInTheDocument();
    });

    it("renders an em dash when external_id is null", () => {
        render(
            <RejectedRecordsTable
                records={[
                    {
                        index: 1,
                        kind: "work_item.v1",
                        external_id: null,
                        code: "unsupported_kind_for_system",
                        path: "records[1].kind",
                        message: "not supported",
                    },
                ]}
            />,
        );
        expect(screen.getByText("—")).toBeInTheDocument();
    });
});
