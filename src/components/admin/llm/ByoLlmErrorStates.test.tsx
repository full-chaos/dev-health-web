/** ByoLlmErrorStates component tests — CHAOS-2563. */
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { ByoLlmErrorStates } from "./ByoLlmErrorStates";

describe("ByoLlmErrorStates", () => {
    it("renders the panel title and description", () => {
        render(<ByoLlmErrorStates />);
        expect(screen.getByText("Explain Error States")).toBeInTheDocument();
    });

    it("renders all five classified states with their HTTP status codes", () => {
        render(<ByoLlmErrorStates />);
        for (const status of ["200", "422", "429", "503", "402"]) {
            expect(screen.getByTestId(`byo-llm-error-state-${status}`)).toBeInTheDocument();
        }
    });

    it("maps each error status to the real backend taxonomy name", () => {
        render(<ByoLlmErrorStates />);
        expect(screen.getByTestId("byo-llm-error-state-422")).toHaveTextContent("LLMAuthError");
        expect(screen.getByTestId("byo-llm-error-state-429")).toHaveTextContent(
            "LLMRateLimitError",
        );
        expect(screen.getByTestId("byo-llm-error-state-429")).toHaveTextContent("Retry-After");
        expect(screen.getByTestId("byo-llm-error-state-503")).toHaveTextContent("LLMServerError");
    });

    it("labels the streamed success state without a taxonomy exception", () => {
        render(<ByoLlmErrorStates />);
        const successState = screen.getByTestId("byo-llm-error-state-200");
        expect(successState).toHaveTextContent("Streamed response");
    });

    it("labels the licensing state as a tier gate, not a provider error", () => {
        render(<ByoLlmErrorStates />);
        const lockedState = screen.getByTestId("byo-llm-error-state-402");
        expect(lockedState).toHaveTextContent("Not licensed");
        expect(lockedState).toHaveTextContent("Tier gate");
    });

    it("renders nothing interactive — purely presentational output", () => {
        render(<ByoLlmErrorStates />);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
});
