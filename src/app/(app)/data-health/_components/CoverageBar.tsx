"use client";

type CoverageBarProps = {
  coveragePercent: number; // 0 to 100
  label?: string;
  className?: string;
};

export function CoverageBar({ coveragePercent, label, className = "" }: CoverageBarProps) {
  const percent = Math.max(0, Math.min(100, Math.round(coveragePercent)));

  // Color code based on coverage
  let barColor = "bg-red-500";
  if (percent >= 90) barColor = "bg-green-500";
  else if (percent >= 70) barColor = "bg-yellow-500";

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between text-sm">
        {label && <span className="font-medium text-foreground">{label}</span>}
        <span className="text-(--ink-muted) font-semibold">{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-(--card-stroke)">
        <div
          className={`h-full ${barColor} transition-all duration-500 ease-in-out`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
