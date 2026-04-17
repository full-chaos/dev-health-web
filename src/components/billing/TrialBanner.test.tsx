/** TrialBanner component tests — CHAOS-1240. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor, cleanup } from "@/test/utils";

const { mockUseSession, mockGetSubscription, mockGetBillingPortalUrl } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockGetSubscription: vi.fn(),
  mockGetBillingPortalUrl: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: mockUseSession,
}));

vi.mock("@/lib/billing/actions", () => ({
  getSubscription: mockGetSubscription,
  getBillingPortalUrl: mockGetBillingPortalUrl,
}));

import { TrialBanner } from "./TrialBanner";

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString();
}

describe("TrialBanner", () => {
  const originalLocation = window.location;
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    };
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

    mockUseSession.mockReturnValue({
      data: { user: { org_id: "org-1" } },
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, href: "http://localhost/" },
    });
  });

  afterEach(() => {
    cleanup();
    mockUseSession.mockReset();
    mockGetSubscription.mockReset();
    mockGetBillingPortalUrl.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("renders nothing when there is no session", async () => {
    mockUseSession.mockReturnValue({ data: null });
    mockGetSubscription.mockResolvedValue({ data: null, error: null });

    const { container } = renderWithToaster(<TrialBanner />);

    expect(container).toHaveTextContent("");
  });

  it("renders the trial banner with correct days remaining (plural)", async () => {
    mockGetSubscription.mockResolvedValue({
      data: {
        id: "sub-1",
        org_id: "org-1",
        status: "trialing",
        stripe_subscription_id: "sub_stripe",
        stripe_customer_id: "cus",
        current_period_start: "",
        current_period_end: "",
        cancel_at_period_end: false,
        canceled_at: null,
        trial_start: null,
        trial_end: futureDate(10),
      },
      error: null,
    });

    renderWithToaster(<TrialBanner />);

    await waitFor(() => {
      expect(screen.getByText(/Your Team trial ends in \d+ days/i)).toBeInTheDocument();
    });
  });

  it("does not render when subscription status is not trialing", async () => {
    mockGetSubscription.mockResolvedValue({
      data: {
        id: "sub-1",
        org_id: "org-1",
        status: "active",
        stripe_subscription_id: "s",
        stripe_customer_id: "c",
        current_period_start: "",
        current_period_end: "",
        cancel_at_period_end: false,
        canceled_at: null,
        trial_start: null,
        trial_end: futureDate(5),
      },
      error: null,
    });

    renderWithToaster(<TrialBanner />);

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Your Team trial ends/i)).not.toBeInTheDocument();
  });

  it("dismiss button hides the banner and persists state in localStorage", async () => {
    mockGetSubscription.mockResolvedValue({
      data: {
        id: "sub-1",
        org_id: "org-1",
        status: "trialing",
        stripe_subscription_id: "s",
        stripe_customer_id: "c",
        current_period_start: "",
        current_period_end: "",
        cancel_at_period_end: false,
        canceled_at: null,
        trial_start: null,
        trial_end: futureDate(10),
      },
      error: null,
    });

    renderWithToaster(<TrialBanner />);

    const dismiss = await screen.findByRole("button", { name: /dismiss/i });
    await userEvent.click(dismiss);

    await waitFor(() => {
      expect(screen.queryByText(/Your Team trial ends/i)).not.toBeInTheDocument();
    });
    expect(localStorage.getItem("trial-banner-dismissed-org-1")).toBeTruthy();
  });

  it("shows an error toast when billing portal URL fetch fails", async () => {
    mockGetSubscription.mockResolvedValue({
      data: {
        id: "sub-1",
        org_id: "org-1",
        status: "trialing",
        stripe_subscription_id: "s",
        stripe_customer_id: "c",
        current_period_start: "",
        current_period_end: "",
        cancel_at_period_end: false,
        canceled_at: null,
        trial_start: null,
        trial_end: futureDate(10),
      },
      error: null,
    });
    mockGetBillingPortalUrl.mockResolvedValue({
      data: null,
      error: "Stripe unavailable",
    });

    renderWithToaster(<TrialBanner />);

    const cta = await screen.findByRole("button", { name: /add payment method/i });
    await userEvent.click(cta);

    await waitFor(() => {
      expect(screen.getByText(/Stripe unavailable/i)).toBeInTheDocument();
    });
  });

  it("rejects unexpected billing portal URLs with an error toast", async () => {
    mockGetSubscription.mockResolvedValue({
      data: {
        id: "sub-1",
        org_id: "org-1",
        status: "trialing",
        stripe_subscription_id: "s",
        stripe_customer_id: "c",
        current_period_start: "",
        current_period_end: "",
        cancel_at_period_end: false,
        canceled_at: null,
        trial_start: null,
        trial_end: futureDate(10),
      },
      error: null,
    });
    mockGetBillingPortalUrl.mockResolvedValue({
      data: { url: "https://evil.example.com/hijack" },
      error: null,
    });

    renderWithToaster(<TrialBanner />);

    const cta = await screen.findByRole("button", { name: /add payment method/i });
    await userEvent.click(cta);

    await waitFor(() => {
      expect(screen.getByText(/Unexpected billing portal URL/i)).toBeInTheDocument();
    });
  });
});
