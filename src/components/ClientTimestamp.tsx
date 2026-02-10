"use client";

import { useEffect, useState } from "react";

const formatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = formatter.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")} ${get("day")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}

interface ClientTimestampProps {
  value?: string | null;
  fallback?: string;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function ClientTimestamp({
  value,
  fallback = "Unavailable",
  prefix,
  suffix,
  className,
}: ClientTimestampProps) {
  const [formatted, setFormatted] = useState<string>("");

  useEffect(() => {
    if (!value) {
      setFormatted(fallback);
      return;
    }
    const result = formatLocal(value);
    setFormatted(result || fallback);
  }, [value, fallback]);

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
