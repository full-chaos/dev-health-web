"use client";

import { useState } from "react";
import { toast } from "sonner";

import type { FeedbackPayload, FeedbackResponse, FeedbackType } from "@/components/feedback/types";

const inputClassName =
  "w-full rounded-xl border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground placeholder:text-(--ink-muted) focus:border-(--accent) focus:outline-none";

type FeedbackFormState = {
  title: string;
  description: string;
  type: FeedbackType;
};

const initialFormState: FeedbackFormState = {
  title: "",
  description: "",
  type: "bug",
};

function BugIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d="M12 6v12" />
      <path d="M8 8h8" />
      <path d="M8 16h8" />
      <path d="M7 10 4 8" />
      <path d="M7 14 4 16" />
      <path d="M17 10l3-2" />
      <path d="M17 14l3 2" />
      <path d="M15 5a3 3 0 1 0-6 0" />
      <rect x="7" y="6" width="10" height="12" rx="5" />
    </svg>
  );
}

export function BugReportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formState, setFormState] = useState<FeedbackFormState>(initialFormState);

  const closePanel = () => {
    if (isLoading) {
      return;
    }

    setIsOpen(false);
  };

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    const payload: FeedbackPayload = {
      title: formState.title,
      description: formState.description,
      type: formState.type,
      url: window.location.pathname,
      userAgent: window.navigator.userAgent,
      timestamp: new Date().toISOString(),
    };

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as FeedbackResponse;

      if (!response.ok || !data.success) {
        toast.error(data.error || "Failed to submit feedback");
        return;
      }

      toast.success(`Issue created: ${data.issueId} ${data.issueUrl ?? ""}`.trim());
      setFormState(initialFormState);
      setIsOpen(false);
    } catch {
      toast.error("Failed to submit feedback");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-(--accent-highlight) bg-(--card-80) text-foreground shadow-xl transition hover:border-(--accent) hover:text-(--accent)"
        onClick={() => setIsOpen(true)}
        aria-label="Report an issue"
      >
        <BugIcon />
      </button>

      {isOpen ? (
        <>
          <button
            type="button"
            aria-label="Close issue report panel"
            className="fixed inset-0 z-50 bg-black/50"
            onClick={closePanel}
          />
          <div
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md translate-x-0 border-l border-(--card-stroke) bg-(--card-80) shadow-2xl transition-transform duration-300 ease-out"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bug-report-title"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-(--card-stroke) px-5 py-4">
                <h2 id="bug-report-title" className="font-(--font-display) text-lg text-foreground">
                  Report an Issue
                </h2>
                <button
                  type="button"
                  className="rounded-md p-2 text-(--ink-muted) transition hover:text-foreground"
                  onClick={closePanel}
                  aria-label="Close"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path d="m6 6 12 12" />
                    <path d="m18 6-12 12" />
                  </svg>
                </button>
              </div>

              <form className="flex flex-1 flex-col gap-4 px-5 py-5" onSubmit={handleSubmit}>
                <label className="space-y-2">
                  <span className="text-sm text-foreground">Title</span>
                  <input
                    type="text"
                    required
                    placeholder="Brief summary..."
                    className={inputClassName}
                    value={formState.title}
                    onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-foreground">Type</span>
                  <select
                    className={inputClassName}
                    value={formState.type}
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        type: event.target.value as FeedbackType,
                      }))
                    }
                  >
                    <option value="bug">Bug</option>
                    <option value="feature">Feature Request</option>
                    <option value="question">Question</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-foreground">Description</span>
                  <textarea
                    required
                    rows={6}
                    placeholder="What happened? Steps to reproduce..."
                    className={inputClassName}
                    value={formState.description}
                    onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>

                <div className="mt-auto pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-(--accent-highlight) bg-(--card-70) px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-(--accent) disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
                    {isLoading ? "Submitting..." : "Submit Report"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
