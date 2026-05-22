"use client";

import React from "react";

export type PrTestOpsSummaryProps = {
  prId: string;
  repoId: string;
  pipelineStatus?: {
    status: "success" | "failure" | "running" | "pending";
    duration?: string;
  };
  testResults?: {
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
  };
  coverageDelta?: number;
  releaseConfidence?: number;
};

export function PrTestOpsSummary({
  prId,
  repoId,
  pipelineStatus,
  testResults,
  coverageDelta,
  releaseConfidence,
}: PrTestOpsSummaryProps) {
  const getStatusColor = (status?: string) => {
    switch (status) {
      case "success":
        return "bg-green-500/20 text-green-500 border-green-500/30";
      case "failure":
        return "bg-red-500/20 text-red-500 border-red-500/30";
      case "running":
        return "bg-blue-500/20 text-blue-500 border-blue-500/30";
      default:
        return "bg-gray-500/20 text-gray-500 border-gray-500/30";
    }
  };

  const getCoverageColor = (delta?: number) => {
    if (delta === undefined) return "text-(--ink-muted)";
    if (delta > 0) return "text-green-500";
    if (delta < 0) return "text-red-500";
    return "text-(--ink-muted)";
  };

  const getConfidenceColor = (score?: number) => {
    if (score === undefined) return "text-(--ink-muted)";
    if (score >= 0.8) return "text-green-500";
    if (score >= 0.5) return "text-amber-500";
    return "text-red-500";
  };

  const totalTests = testResults
    ? testResults.passed + testResults.failed + testResults.skipped + testResults.flaky
    : 0;

  return (
    <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-(--font-display) text-lg">TestOps Summary</h3>
          <p className="text-xs text-(--ink-muted)">
            {repoId} • {prId}
          </p>
        </div>
        {pipelineStatus && (
          <div
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${getStatusColor(
              pipelineStatus.status,
            )}`}
            data-testid="pipeline-status"
          >
            {pipelineStatus.status}
            {pipelineStatus.duration && ` (${pipelineStatus.duration})`}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-(--ink-muted)">Tests</span>
          {testResults ? (
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-medium" data-testid="test-passed">
                {testResults.passed}
              </span>
              <span className="text-xs text-(--ink-muted)">/ {totalTests}</span>
              {testResults.failed > 0 && (
                <span className="text-xs text-red-500 font-medium ml-1" data-testid="test-failed">
                  {testResults.failed} failed
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm text-(--ink-muted)">No data</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-(--ink-muted)">Flaky</span>
          {testResults ? (
            <span
              className={`text-xl font-medium ${testResults.flaky > 0 ? "text-amber-500" : ""}`}
              data-testid="test-flaky"
            >
              {testResults.flaky}
            </span>
          ) : (
            <span className="text-sm text-(--ink-muted)">No data</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-(--ink-muted)">Coverage</span>
          {coverageDelta !== undefined ? (
            <span
              className={`text-xl font-medium ${getCoverageColor(coverageDelta)}`}
              data-testid="coverage-delta"
            >
              {coverageDelta > 0 ? "+" : ""}
              {coverageDelta}%
            </span>
          ) : (
            <span className="text-sm text-(--ink-muted)">No data</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-(--ink-muted)">Confidence</span>
          {releaseConfidence !== undefined ? (
            <span
              className={`text-xl font-medium ${getConfidenceColor(releaseConfidence)}`}
              data-testid="release-confidence"
            >
              {Math.round(releaseConfidence * 100)}%
            </span>
          ) : (
            <span className="text-sm text-(--ink-muted)">No data</span>
          )}
        </div>
      </div>
    </div>
  );
}
