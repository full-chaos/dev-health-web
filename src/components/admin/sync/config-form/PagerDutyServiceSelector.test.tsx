import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PagerDutyServiceSelector } from "./PagerDutyServiceSelector";

describe("PagerDutyServiceSelector", () => {
    it("emits a selected resolved service ID without rendering the ID as the option label", async () => {
        const user = userEvent.setup();
        const onChangeAction = vi.fn();
        render(
            <PagerDutyServiceSelector
                rowId="mapping-1"
                value=""
                state={{
                    kind: "ready",
                    services: [
                        {
                            external_id: "P123ABC",
                            display_name: "Payments API",
                            name_resolved: true,
                            status: "active",
                        },
                    ],
                }}
                errorId="mapping-error"
                isInvalid={false}
                onChangeAction={onChangeAction}
            />,
        );

        await user.selectOptions(screen.getByLabelText("PagerDuty service"), "P123ABC");

        expect(onChangeAction).toHaveBeenCalledWith("P123ABC");
        expect(screen.getByRole("option", { name: "Payments API" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: /P123ABC/ })).not.toBeInTheDocument();
    });

    it("keeps an unavailable persisted selection controlled without exposing its raw ID", () => {
        render(
            <PagerDutyServiceSelector
                rowId="mapping-1"
                value="P123ABC"
                state={{ kind: "ready", services: [] }}
                errorId="mapping-error"
                isInvalid={false}
                onChangeAction={vi.fn()}
            />,
        );

        expect(
            screen.getByRole("option", { name: "Unavailable service — select a replacement" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Unresolved")).toBeInTheDocument();
        expect(screen.queryByText("P123ABC")).not.toBeInTheDocument();
        expect(screen.getByLabelText("PagerDuty service")).not.toHaveAttribute("aria-invalid");
    });

    it("disables selection while loading and announces the pending service request", () => {
        render(
            <PagerDutyServiceSelector
                rowId="mapping-1"
                value=""
                state={{ kind: "loading" }}
                errorId="mapping-error"
                isInvalid={false}
                onChangeAction={vi.fn()}
            />,
        );

        expect(screen.getByLabelText("PagerDuty service")).toBeDisabled();
        expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
        expect(screen.getByRole("status")).toHaveTextContent("Loading PagerDuty services…");
    });

    it("offers a retry action when the resolved service request fails", async () => {
        const user = userEvent.setup();
        const onRetryAction = vi.fn();
        render(
            <PagerDutyServiceSelector
                rowId="mapping-1"
                value=""
                state={{ kind: "error", onRetryAction }}
                errorId="mapping-error"
                isInvalid={false}
                onChangeAction={vi.fn()}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Retry" }));

        expect(screen.getByLabelText("PagerDuty service")).toBeDisabled();
        expect(onRetryAction).toHaveBeenCalledOnce();
    });

    it("does not render an unresolved service identifier as the option label", () => {
        render(
            <PagerDutyServiceSelector
                rowId="mapping-1"
                value=""
                state={{
                    kind: "ready",
                    services: [
                        {
                            external_id: "P123ABC",
                            display_name: "P123ABC",
                            name_resolved: false,
                            status: null,
                        },
                    ],
                }}
                errorId="mapping-error"
                isInvalid={false}
                onChangeAction={vi.fn()}
            />,
        );

        expect(
            screen.getByRole("option", { name: "PagerDuty service (Unresolved)" }),
        ).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "P123ABC" })).not.toBeInTheDocument();
    });
});
