"use client";

import { useSyncExternalStore } from "react";

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

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

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
  const isClient = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const formatted = isClient
    ? (value ? formatLocal(value) || fallback : fallback)
    : "";

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
