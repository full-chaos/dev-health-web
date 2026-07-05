import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { AuditLogFilters } from "./AuditLogFilters";

describe("AuditLogFilters — admin variant", () => {
    it("renders labelled action, resource type, status, and date inputs", () => {
        render(<AuditLogFilters variant="admin" onFilter={vi.fn()} />);
        expect(screen.getByLabelText(/action/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/resource type/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^status$/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
    });

    it("calls onFilter with typed values on submit", async () => {
        const onFilter = vi.fn();
        const user = userEvent.setup();
        render(<AuditLogFilters variant="admin" onFilter={onFilter} />);

        await user.type(screen.getByLabelText(/action/i), "org.create");
        // Use querySelector since <form> needs a name attr for getByRole("form")
        fireEvent.submit(document.querySelector("form")!);

        expect(onFilter).toHaveBeenCalledWith(expect.objectContaining({ action: "org.create" }));
    });

    it("omits empty fields from the filter call", () => {
        const onFilter = vi.fn();
        render(<AuditLogFilters variant="admin" onFilter={onFilter} />);
        fireEvent.submit(document.querySelector("form")!);

        expect(onFilter).toHaveBeenCalledWith({
            action: undefined,
            resource_type: undefined,
            status: undefined,
            start_date: undefined,
            end_date: undefined,
        });
    });

    it("renders the Apply filters and Reset filters buttons", () => {
        render(<AuditLogFilters variant="admin" onFilter={vi.fn()} />);
        expect(screen.getByRole("button", { name: /apply filters/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /reset filters/i })).toBeInTheDocument();
    });

    it("Reset immediately clears an empty filter without waiting for Apply", async () => {
        const onFilter = vi.fn();
        const user = userEvent.setup();
        render(<AuditLogFilters variant="admin" onFilter={onFilter} />);

        await user.type(screen.getByLabelText(/action/i), "org.create");
        await user.selectOptions(screen.getByLabelText(/^status$/i), "success");
        await user.click(screen.getByRole("button", { name: /reset filters/i }));

        expect(onFilter).toHaveBeenCalledWith({
            action: undefined,
            resource_type: undefined,
            status: undefined,
            start_date: undefined,
            end_date: undefined,
        });
        expect(screen.getByLabelText(/action/i)).toHaveValue("");
        expect(screen.getByLabelText(/^status$/i)).toHaveValue("");
    });

    it("applies again cleanly after a reset (apply \u2192 reset \u2192 apply)", async () => {
        const onFilter = vi.fn();
        const user = userEvent.setup();
        render(<AuditLogFilters variant="admin" onFilter={onFilter} />);

        await user.type(screen.getByLabelText(/action/i), "org.create");
        await user.click(screen.getByRole("button", { name: /apply filters/i }));
        await user.click(screen.getByRole("button", { name: /reset filters/i }));
        await user.type(screen.getByLabelText(/action/i), "user.invite");
        await user.click(screen.getByRole("button", { name: /apply filters/i }));

        expect(onFilter).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: "org.create" }));
        expect(onFilter).toHaveBeenNthCalledWith(2, expect.objectContaining({ action: undefined }));
        expect(onFilter).toHaveBeenNthCalledWith(3, expect.objectContaining({ action: "user.invite" }));
    });
});

describe("AuditLogFilters — billing variant", () => {
    it("renders the reconciliation status select", () => {
        render(<AuditLogFilters variant="billing" onApply={vi.fn()} />);
        expect(screen.getByRole("combobox")).toBeInTheDocument();
        expect(screen.getByText("any status")).toBeInTheDocument();
    });

    it("calls onApply with billing filter shape on submit", async () => {
        const onApply = vi.fn();
        const user = userEvent.setup();
        render(<AuditLogFilters variant="billing" onApply={onApply} />);

        await user.selectOptions(screen.getByRole("combobox"), "matched");
        fireEvent.submit(document.querySelector("form")!);

        expect(onApply).toHaveBeenCalledWith(
            expect.objectContaining({ reconciliation_status: "matched" }),
        );
    });

    it("renders the Apply button", () => {
        render(<AuditLogFilters variant="billing" onApply={vi.fn()} />);
        expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
    });

    it("omits empty fields from the apply call", () => {
        const onApply = vi.fn();
        render(<AuditLogFilters variant="billing" onApply={onApply} />);
        fireEvent.submit(document.querySelector("form")!);

        expect(onApply).toHaveBeenCalledWith({
            resource_type: undefined,
            action: undefined,
            reconciliation_status: undefined,
            from_date: undefined,
            to_date: undefined,
        });
    });
});
