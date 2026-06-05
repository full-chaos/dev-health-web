import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/origin", () => ({
    resolveOrigin: () => "http://localhost:3000",
}));

import { SignupForm } from "./SignupForm";

/** Helper: fill required fields and check the terms checkbox */
async function fillAndSubmit(
    user: ReturnType<typeof userEvent.setup>,
    overrides: {
        displayName?: string;
        email?: string;
        password?: string;
        agreeToTerms?: boolean;
    } = {},
) {
    const {
        displayName,
        email = "test@example.com",
        password = "password12345",
        agreeToTerms = true,
    } = overrides;

    if (displayName) {
        await user.type(screen.getByLabelText("Display name"), displayName);
    }
    await user.type(screen.getByLabelText("Email"), email);
    await user.type(screen.getByLabelText("Password"), password);
    if (agreeToTerms) {
        await user.click(screen.getByRole("checkbox"));
    }
    await user.click(screen.getByRole("button", { name: "Create account" }));
}

describe("SignupForm", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        mockPush.mockReset();
    });

    it("renders all form fields", () => {
        renderWithToaster(<SignupForm />);

        expect(screen.getByLabelText("Display name")).toBeInTheDocument();
        expect(screen.getByLabelText("Email")).toBeInTheDocument();
        expect(screen.getByLabelText("Password")).toBeInTheDocument();
        expect(screen.getByRole("checkbox")).toBeInTheDocument();
    });

    it("renders submit button (disabled until terms accepted)", () => {
        renderWithToaster(<SignupForm />);

        const button = screen.getByRole("button", { name: "Create account" });
        expect(button).toBeInTheDocument();
        expect(button).toBeDisabled();
    });

    it("enables submit button when terms checkbox is checked", async () => {
        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("checkbox"));
        expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
    });

    it("shows password strength indicator", async () => {
        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText("Password"), "weak");
        expect(screen.getByText("Password strength")).toBeInTheDocument();
        expect(screen.getByText("Weak")).toBeInTheDocument();
    });

    it("shows password too short error", async () => {
        vi.spyOn(global, "fetch");
        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await fillAndSubmit(user, { password: "short" });

        await waitFor(() => {
            expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
        });
    });

    it("shows terms required error when not accepted", async () => {
        vi.spyOn(global, "fetch");
        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText("Email"), "test@example.com");
        await user.type(screen.getByLabelText("Password"), "password12345");
        // Check then uncheck terms to enable and click submit
        await user.click(screen.getByRole("checkbox"));
        await user.click(screen.getByRole("checkbox"));

        // Button should be disabled again
        expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
    });

    it("successful registration redirects to signin", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({}), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await fillAndSubmit(user, { displayName: "Test User" });

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith("/auth/signin?registered=true");
        });
    });

    it("preserves team trial intent when redirecting to signin", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({}), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        renderWithToaster(<SignupForm plan="team" trialIntent />);
        const user = userEvent.setup();

        await fillAndSubmit(user, { displayName: "Trial User", email: "trial@example.com" });

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith(
                "/auth/signin?registered=true&plan=team&trial=true",
            );
        });
    });

    it("shows server error on failed registration", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ detail: "Email already exists" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            }),
        );

        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(screen.getByText("Email already exists")).toBeInTheDocument();
        });
    });

    it("shows rate limit message on 429 (JSON body)", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
                status: 429,
                headers: { "Content-Type": "application/json" },
            }),
        );

        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(
                screen.getByText("Too many registration attempts. Please try again later."),
            ).toBeInTheDocument();
        });
    });

    it("shows rate limit message on 429 (text/plain body from slowapi)", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response("Rate limit exceeded: 3 per 1 hour", {
                status: 429,
                headers: { "Content-Type": "text/plain" },
            }),
        );

        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(
                screen.getByText("Too many registration attempts. Please try again later."),
            ).toBeInTheDocument();
        });
    });

    it("handles non-JSON error body on non-429 failure", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response("Internal Server Error", {
                status: 500,
                headers: { "Content-Type": "text/plain" },
            }),
        );

        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(screen.getByText("Registration failed")).toBeInTheDocument();
        });
    });

    it("shows generic error on network failure", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockRejectedValue(new Error("Network error"));

        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(screen.getByText("An error occurred. Please try again.")).toBeInTheDocument();
        });
    });

    it("shows password policy violations from backend", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    detail: {
                        violations: [
                            "Password must be at least 12 characters long",
                            "Password must contain at least one uppercase letter",
                        ],
                    },
                }),
                {
                    status: 422,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );

        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(
                screen.getByText(/Password must be at least 12 characters long/),
            ).toBeInTheDocument();
        });
    });

    it("shows Pydantic validation errors from backend", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    detail: [
                        {
                            loc: ["body", "email"],
                            msg: "value is not a valid email address",
                            type: "value_error",
                        },
                    ],
                }),
                {
                    status: 422,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );

        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(screen.getByText("value is not a valid email address")).toBeInTheDocument();
        });
    });

    it("shows normalized error with message and errors array", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    detail: {
                        message: "Password validation failed",
                        errors: [
                            "Password must be at least 12 characters long",
                            "Password must include at least one number",
                        ],
                    },
                }),
                {
                    status: 422,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );

        renderWithToaster(<SignupForm />);
        const user = userEvent.setup();

        await fillAndSubmit(user);

        await waitFor(() => {
            expect(
                screen.getByText(/Password must be at least 12 characters long/),
            ).toBeInTheDocument();
        });
    });
});
