"use client";

import { useSyncExternalStore } from "react";
import { formatTimestamp } from "@/lib/formatters";

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

    const formatted = isClient ? formatTimestamp(value, fallback) : "";

    return (
        <span className={className}>
            {prefix}
            {formatted}
            {suffix}
        </span>
    );
}
