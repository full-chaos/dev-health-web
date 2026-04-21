import React, { KeyboardEvent, useState } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import type { ChordDirection, ChordGroupingDimension } from "@/lib/types";

export type ChordControlsValue = {
  direction: ChordDirection;
  grouping: ChordGroupingDimension;
  topN: number;
  showSelfLinks: boolean;
  showOther: boolean;
};

export type ChordChartControlsProps = {
  value: ChordControlsValue;
  onChange: (next: ChordControlsValue) => void;
  otherAvailable?: boolean;
  className?: string;
};

export const CHORD_CONTROLS_DEFAULTS: ChordControlsValue = {
  direction: "bilateral",
  grouping: "team",
  topN: 8,
  showSelfLinks: false,
  showOther: true,
};

export function parseChordControlsFromSearchParams(
  sp: URLSearchParams | ReadonlyURLSearchParams
): ChordControlsValue {
  const dir = sp.get("chord.dir");
  const group = sp.get("chord.group");
  const n = sp.get("chord.n");
  const self = sp.get("chord.self");
  const other = sp.get("chord.other");

  const direction = (["bilateral", "in", "out", "net"].includes(dir as string)
    ? dir
    : CHORD_CONTROLS_DEFAULTS.direction) as ChordDirection;

  const grouping = (["team", "repo", "work_type"].includes(group as string)
    ? group
    : CHORD_CONTROLS_DEFAULTS.grouping) as ChordGroupingDimension;

  let topN = CHORD_CONTROLS_DEFAULTS.topN;
  if (n) {
    const parsedN = parseInt(n, 10);
    if (!isNaN(parsedN)) {
      // Clamp to [3, 16]
      topN = Math.max(3, Math.min(16, parsedN));
    }
  }

  const showSelfLinks = self ? self === "true" : CHORD_CONTROLS_DEFAULTS.showSelfLinks;
  const showOther = other ? other === "true" : CHORD_CONTROLS_DEFAULTS.showOther;

  return { direction, grouping, topN, showSelfLinks, showOther };
}

export function serializeChordControlsToSearchParams(
  value: ChordControlsValue,
  sp: URLSearchParams
): URLSearchParams {
  if (value.direction !== CHORD_CONTROLS_DEFAULTS.direction) {
    sp.set("chord.dir", value.direction);
  } else {
    sp.delete("chord.dir");
  }

  if (value.grouping !== CHORD_CONTROLS_DEFAULTS.grouping) {
    sp.set("chord.group", value.grouping);
  } else {
    sp.delete("chord.group");
  }

  if (value.topN !== CHORD_CONTROLS_DEFAULTS.topN) {
    sp.set("chord.n", value.topN.toString());
  } else {
    sp.delete("chord.n");
  }

  if (value.showSelfLinks !== CHORD_CONTROLS_DEFAULTS.showSelfLinks) {
    sp.set("chord.self", value.showSelfLinks.toString());
  } else {
    sp.delete("chord.self");
  }

  if (value.showOther !== CHORD_CONTROLS_DEFAULTS.showOther) {
    sp.set("chord.other", value.showOther.toString());
  } else {
    sp.delete("chord.other");
  }

  return sp;
}

const DIRECTIONS: { value: ChordDirection; label: string }[] = [
  { value: "bilateral", label: "Bilateral" },
  { value: "in", label: "Inflow" },
  { value: "out", label: "Outflow" },
  { value: "net", label: "Net" },
];

export function ChordChartControls({
  value,
  onChange,
  otherAvailable = true,
  className = "",
}: ChordChartControlsProps) {
  const [topNInput, setTopNInput] = useState(value.topN.toString());
  const [prevTopN, setPrevTopN] = useState(value.topN);

  if (value.topN !== prevTopN) {
    setPrevTopN(value.topN);
    setTopNInput(value.topN.toString());
  }

  const handleDirectionKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (index + 1) % DIRECTIONS.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = (index - 1 + DIRECTIONS.length) % DIRECTIONS.length;
    } else {
      return;
    }
    e.preventDefault();
    const nextValue = DIRECTIONS[nextIndex].value;
    onChange({ ...value, direction: nextValue });
    // Focus the next button
    const buttons = document.querySelectorAll('[role="radio"]');
    if (buttons[nextIndex]) {
      (buttons[nextIndex] as HTMLButtonElement).focus();
    }
  };

  const handleTopNBlur = () => {
    const parsed = parseInt(topNInput, 10);
    if (isNaN(parsed)) {
      setTopNInput(value.topN.toString());
      return;
    }
    const clamped = Math.max(3, Math.min(16, parsed));
    setTopNInput(clamped.toString());
    if (clamped !== value.topN) {
      onChange({ ...value, topN: clamped });
    }
  };

  return (
    <div className={`flex flex-wrap gap-4 items-end ${className}`}>
      {/* Direction Segmented Control */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300" id="chord-dir-label">
          Flow
        </label>
        <div
          role="radiogroup"
          aria-labelledby="chord-dir-label"
          className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
        >
          {DIRECTIONS.map((dir, i) => {
            const isActive = value.direction === dir.value;
            return (
              <button
                key={dir.value}
                role="radio"
                aria-checked={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onChange({ ...value, direction: dir.value })}
                onKeyDown={(e) => handleDirectionKeyDown(e, i)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {dir.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grouping Select */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="chord-grouping" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Group by
        </label>
        <select
          id="chord-grouping"
          value={value.grouping}
          onChange={(e) => onChange({ ...value, grouping: e.target.value as ChordGroupingDimension })}
          className="h-9 px-3 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="team">Team</option>
          <option value="repo">Repository</option>
          <option value="work_type">Work type</option>
        </select>
      </div>

      {/* Top-N Stepper */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="chord-topn" className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Entities
        </label>
        <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 overflow-hidden h-9">
          <button
            type="button"
            aria-label="Decrease entities"
            onClick={() => {
              const next = Math.max(3, value.topN - 1);
              setTopNInput(next.toString());
              onChange({ ...value, topN: next });
            }}
            disabled={value.topN <= 3}
            className="px-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 h-full"
          >
            -
          </button>
          <input
            id="chord-topn"
            type="number"
            min={3}
            max={16}
            step={1}
            value={topNInput}
            onChange={(e) => setTopNInput(e.target.value)}
            onBlur={handleTopNBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleTopNBlur();
              }
            }}
            className="w-12 text-center text-sm bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            aria-label="Increase entities"
            onClick={() => {
              const next = Math.min(16, value.topN + 1);
              setTopNInput(next.toString());
              onChange({ ...value, topN: next });
            }}
            disabled={value.topN >= 16}
            className="px-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 h-full"
          >
            +
          </button>
        </div>
      </div>

      {/* Checkboxes */}
      <div className="flex items-center gap-4 h-9">
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={value.showSelfLinks}
            onChange={(e) => onChange({ ...value, showSelfLinks: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          Include self-links
        </label>

        <label
          className={`flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 ${
            !otherAvailable ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          }`}
          aria-disabled={!otherAvailable}
        >
          <input
            type="checkbox"
            checked={value.showOther}
            onChange={(e) => onChange({ ...value, showOther: e.target.checked })}
            disabled={!otherAvailable}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          Show &apos;Other&apos; bucket
        </label>
      </div>
    </div>
  );
}
