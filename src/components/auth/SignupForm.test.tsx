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
    await user.type(screen.getByLabelText("Password"), "password123")
    await user.type(screen.getByLabelText("Confirm Password"), "different123")
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
        screen.getByText("Password must be at least 8 characters"),
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
    await user.type(screen.getByLabelText("Password"), "password123")
    await user.type(screen.getByLabelText("Confirm Password"), "password123")
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
    await user.type(screen.getByLabelText("Password"), "password123")
    await user.type(screen.getByLabelText("Confirm Password"), "password123")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(screen.getByText("Email already exists")).toBeInTheDocument()
    })
  })

  it("shows please-wait message on 429 rate limit", async () => {
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
    await user.type(screen.getByLabelText("Password"), "password123")
    await user.type(screen.getByLabelText("Confirm Password"), "password123")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(
        screen.getByText("Please wait a moment before trying again."),
      ).toBeInTheDocument()
    })
  })

  it("shows generic error on network failure", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockRejectedValue(new Error("Network error"))

    renderWithToaster(<SignupForm />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Email"), "test@example.com")
    await user.type(screen.getByLabelText("Password"), "password123")
    await user.type(screen.getByLabelText("Confirm Password"), "password123")
    await user.click(screen.getByRole("button", { name: "Create Account" }))

    await waitFor(() => {
      expect(screen.getByText("An error occurred. Please try again.")).toBeInTheDocument()
    })
  })
})
