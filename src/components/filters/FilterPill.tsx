import React from "react";

type FilterPillProps = {
  label: string;
  value: string;
  onClear: () => void;
  onClick?: () => void;
};

export function FilterPill({ label, value, onClear, onClick }: FilterPillProps) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-(--card-stroke) bg-card pl-3 pr-1 py-1 text-xs transition-colors hover:border-(--accent)">
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1 ${onClick ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className="uppercase tracking-[0.2em] text-(--ink-muted)">{label}:</span>
        <span className="text-foreground font-medium">{value}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-(--ink-muted) hover:bg-(--card-80) hover:text-foreground"
        aria-label={`Remove ${label} filter`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 3l6 6m0-6l-6 6" />
        </svg>
      </button>
    </div>
  );
}
