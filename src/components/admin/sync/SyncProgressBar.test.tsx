import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@/test/utils";
import { SyncProgressBar } from "./SyncProgressBar";

type SyncProgressUpdate = {
  provider: string;
  status: string;
  itemsProcessed: number;
  itemsTotal: number;
  message?: string;
  stage?: string;
  current_step?: string;
};

type SyncProgressOptions = {
  orgId: string;
  onUpdate?: (data: SyncProgressUpdate) => void;
};

let latestOptions: SyncProgressOptions | null = null;

vi.mock("@/lib/graphql/hooks/useSubscription", () => ({
  useSyncProgress: (options: SyncProgressOptions) => {
    latestOptions = options;
    return { data: null, loading: false, error: null };
  },
}));

function emit(update: SyncProgressUpdate) {
  act(() => {
    latestOptions?.onUpdate?.(update);
  });
}

describe("SyncProgressBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    latestOptions = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows elapsed time when running", () => {
    render(<SyncProgressBar configId="cfg-1" provider="github" orgId="org-1" />);

    emit({ provider: "github", status: "RUNNING", itemsProcessed: 1, itemsTotal: 10 });

    act(() => {
      vi.advanceTimersByTime(65_000);
    });

    expect(screen.getByText(/Elapsed 01:05/)).toBeInTheDocument();
  });

  it("shows ETA when enough progress data is available", () => {
    render(<SyncProgressBar configId="cfg-1" provider="github" orgId="org-1" />);

    emit({ provider: "github", status: "RUNNING", itemsProcessed: 4, itemsTotal: 10 });

    act(() => {
      vi.advanceTimersByTime(40_000);
    });

    expect(screen.getByText("~1m 0s remaining")).toBeInTheDocument();
  });

  it("shows Calculating when less than 2 items are processed", () => {
    render(<SyncProgressBar configId="cfg-1" provider="github" orgId="org-1" />);

    emit({ provider: "github", status: "RUNNING", itemsProcessed: 1, itemsTotal: 10 });

    expect(screen.getByText("Calculating...")).toBeInTheDocument();
  });

  it("displays percentage text when no stage is provided", () => {
    render(<SyncProgressBar configId="cfg-1" provider="github" orgId="org-1" />);

    emit({ provider: "github", status: "RUNNING", itemsProcessed: 9, itemsTotal: 20 });

    expect(screen.getByText(/45% complete/)).toBeInTheDocument();
  });
});
