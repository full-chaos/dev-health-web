import { afterEach, describe, expect, it, vi } from "vitest"
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils"

const mockPush = vi.fn()
const mockRefresh = vi.fn()
const mockUpdate = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { access_token: "test-token" },
    update: mockUpdate,
  }),
}))

vi.mock("@/lib/origin", () => ({
  resolveOrigin: () => "http://localhost:8000",
}))

import { OnboardForm } from "./OnboardForm"

describe("OnboardForm", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    mockPush.mockReset()
    mockRefresh.mockReset()
    mockUpdate.mockReset()
  })

  it("renders org name field and submit button", () => {
    renderWithToaster(<OnboardForm />)

    expect(screen.getByLabelText("Organization Name")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create Workspace" })).toBeInTheDocument()
  })

  it("renders placeholder text", () => {
    renderWithToaster(<OnboardForm />)

    expect(screen.getByPlaceholderText("My Company")).toBeInTheDocument()
    expect(
      screen.getByText('Leave blank to use "My Organization"'),
    ).toBeInTheDocument()
  })

  it("submits with org name and redirects", async () => {
    mockUpdate.mockResolvedValue(undefined)
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          org_id: "org-123",
          role: "owner",
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )

    renderWithToaster(<OnboardForm />)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText("Organization Name"), "Test Org")
    await user.click(screen.getByRole("button", { name: "Create Workspace" }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        onboardComplete: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          org_id: "org-123",
          role: "owner",
          expires_in: 3600,
        },
      })
      expect(mockPush).toHaveBeenCalledWith("/dashboard")
    })
  })

  it("submits blank name (uses default)", async () => {
    mockUpdate.mockResolvedValue(undefined)
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          org_id: "org-123",
          role: "owner",
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )

    renderWithToaster(<OnboardForm />)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Create Workspace" }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    const options = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined
    const body = options?.body
    const parsedBody =
      typeof body === "string" ? (JSON.parse(body) as { org_name?: string; action: string }) : null

    expect(parsedBody).toEqual({ action: "create_org" })
    expect(parsedBody?.org_name).toBeUndefined()
  })

  it("shows server error", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Org limit reached" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    )

    renderWithToaster(<OnboardForm />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "Create Workspace" }))

    await waitFor(() => {
      expect(screen.getByText("Org limit reached")).toBeInTheDocument()
    })
  })

  it("shows generic error on network failure", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockRejectedValue(new Error("Network error"))

    renderWithToaster(<OnboardForm />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "Create Workspace" }))

    await waitFor(() => {
      expect(screen.getByText("An error occurred. Please try again.")).toBeInTheDocument()
    })
  })

  it("shows rate limit message on 429", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockResolvedValue(
      new Response("Rate limit exceeded", {
        status: 429,
        headers: { "Content-Type": "text/plain" },
      }),
    )

    renderWithToaster(<OnboardForm />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "Create Workspace" }))

    await waitFor(() => {
      expect(
        screen.getByText("Too many requests. Please try again later."),
      ).toBeInTheDocument()
    })
  })

  it("handles non-JSON error body", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
    fetchSpy.mockResolvedValue(
      new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }),
    )

    renderWithToaster(<OnboardForm />)
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "Create Workspace" }))

    await waitFor(() => {
      expect(screen.getByText("Failed to create workspace")).toBeInTheDocument()
    })
  })
})
