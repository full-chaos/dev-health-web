import { afterEach, describe, expect, it, vi } from "vitest"
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils"

const mockPush = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock("@/lib/origin", () => ({
  resolveOrigin: () => "http://localhost:3000",
}))

import { SignupForm } from "./SignupForm"

describe("SignupForm", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    mockPush.mockReset()
  })

  it("renders all form fields", () => {
    renderWithToaster(<SignupForm />)

    expect(screen.getByLabelText("Full Name")).toBeInTheDocument()
    expect(screen.getByLabelText("Email")).toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toBeInTheDocument()
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument()
  })

  it("renders submit button and sign-in link", () => {
    renderWithToaster(<SignupForm />)

    expect(
      screen.getByRole("button", {
        name: "Create Account",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument()
  })

  it("shows password mismatch error", async () => {
    vi.spyOn(global, "fetch")
    renderWithToaster(<SignupForm />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Email"), "test@example.com")
    await user.type(screen.getByLabelText("Password"), "password12345")
    await user.type(screen.getByLabelText("Confirm Password"), "different12345")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument()
    })
  })

  it("shows password too short error", async () => {
    vi.spyOn(global, "fetch")
    renderWithToaster(<SignupForm />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Email"), "test@example.com")
    await user.type(screen.getByLabelText("Password"), "short")
    await user.type(screen.getByLabelText("Confirm Password"), "short")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 12 characters"),
      ).toBeInTheDocument()
    })
  })

  it("successful registration redirects to signin", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    renderWithToaster(<SignupForm />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Full Name"), "Test User")
    await user.type(screen.getByLabelText("Email"), "test@example.com")
    await user.type(screen.getByLabelText("Password"), "password12345")
    await user.type(screen.getByLabelText("Confirm Password"), "password12345")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/auth/signin?registered=true")
    })
  })

  it("shows server error on failed registration", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Email already exists" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    )

    renderWithToaster(<SignupForm />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Email"), "test@example.com")
    await user.type(screen.getByLabelText("Password"), "password12345")
    await user.type(screen.getByLabelText("Confirm Password"), "password12345")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(screen.getByText("Email already exists")).toBeInTheDocument()
    })
  })

  it("shows rate limit message on 429 (JSON body)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    )

    renderWithToaster(<SignupForm />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Email"), "test@example.com")
    await user.type(screen.getByLabelText("Password"), "password12345")
    await user.type(screen.getByLabelText("Confirm Password"), "password12345")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(
        screen.getByText("Too many registration attempts. Please try again later."),
      ).toBeInTheDocument()
    })
  })

  it("shows rate limit message on 429 (text/plain body from slowapi)", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockResolvedValue(
      new Response("Rate limit exceeded: 3 per 1 hour", {
        status: 429,
        headers: { "Content-Type": "text/plain" },
      }),
    )

    renderWithToaster(<SignupForm />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Email"), "test@example.com")
    await user.type(screen.getByLabelText("Password"), "password12345")
    await user.type(screen.getByLabelText("Confirm Password"), "password12345")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(
        screen.getByText("Too many registration attempts. Please try again later."),
      ).toBeInTheDocument()
    })
  })

  it("handles non-JSON error body on non-429 failure", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockResolvedValue(
      new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }),
    )

    renderWithToaster(<SignupForm />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Email"), "test@example.com")
    await user.type(screen.getByLabelText("Password"), "password12345")
    await user.type(screen.getByLabelText("Confirm Password"), "password12345")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(screen.getByText("Registration failed")).toBeInTheDocument()
    })
  })

  it("shows generic error on network failure", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockRejectedValue(new Error("Network error"))

    renderWithToaster(<SignupForm />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Email"), "test@example.com")
    await user.type(screen.getByLabelText("Password"), "password12345")
    await user.type(screen.getByLabelText("Confirm Password"), "password12345")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(screen.getByText("An error occurred. Please try again.")).toBeInTheDocument()
    })
  })

  it("shows password policy violations from backend", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
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
    )

    renderWithToaster(<SignupForm />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Email"), "test@example.com")
    await user.type(screen.getByLabelText("Password"), "password12345")
    await user.type(screen.getByLabelText("Confirm Password"), "password12345")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(
        screen.getByText(/Password must be at least 12 characters long/),
      ).toBeInTheDocument()
    })
  })

  it("shows Pydantic validation errors from backend", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [
            { loc: ["body", "email"], msg: "value is not a valid email address", type: "value_error" },
          ],
        }),
        {
          status: 422,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )

    renderWithToaster(<SignupForm />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Email"), "test@example.com")
    await user.type(screen.getByLabelText("Password"), "password12345")
    await user.type(screen.getByLabelText("Confirm Password"), "password12345")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(
        screen.getByText("value is not a valid email address"),
      ).toBeInTheDocument()
    })
  })
})
