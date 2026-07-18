import type { ReactNode } from "react";
import type { ACRContextPacketV1 } from "@/lib/acr/generated";
import { displayPacketNumber, displayPacketTime } from "./contextPacketFormatters";

export function ContextPacketDiagnostics({ packet }: { readonly packet: ACRContextPacketV1 }) {
    return (
        <section
            className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4"
            aria-label="Context Fabric diagnostics"
        >
            <DiagnosticCard title="Freshness">
                <p>
                    As of {displayPacketTime(packet.freshness.as_of)}. Refresh after{" "}
                    {Math.round(packet.freshness.stale_after_seconds / 3600)} hours.
                </p>
                <ul className="mt-2">
                    {packet.freshness.watermarks.map((watermark) => (
                        <li key={watermark.source}>
                            {watermark.source}: {watermark.status}
                            {watermark.last_ingested_at
                                ? ` (${displayPacketTime(watermark.last_ingested_at)})`
                                : ""}
                        </li>
                    ))}
                </ul>
            </DiagnosticCard>
            <DiagnosticCard title="Coverage">
                <p>
                    {packet.coverage.sources_available.length} of{" "}
                    {packet.coverage.sources_considered.length} sources available.
                </p>
                <p className="mt-2">
                    {packet.coverage.partial ? "Coverage is partial." : "Coverage is complete."}
                </p>
                <ul className="mt-2">
                    {packet.coverage.sources_unavailable.map((source) => (
                        <li key={source.source}>
                            {source.source}: {source.reason}
                        </li>
                    ))}
                    {packet.coverage.degraded_reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                    ))}
                </ul>
            </DiagnosticCard>
            <DiagnosticCard title="Budget">
                <p>
                    {packet.budget.items_used} of {packet.budget.max_items} items used ·{" "}
                    {packet.budget.estimated_tokens} estimated tokens.
                </p>
                <p className="mt-2">
                    {displayPacketNumber(packet.budget.serialized_bytes)} serialized bytes ·{" "}
                    {packet.budget.truncated ? "output truncated" : "output complete"}
                </p>
            </DiagnosticCard>
            <DiagnosticCard title="Checks and next steps">
                <p>
                    {packet.required_checks.length} required check and{" "}
                    {packet.recommended_next_steps.length} recommended next step.
                </p>
                <ul className="mt-2">
                    {packet.required_checks.map((check) => (
                        <li key={check.check_id}>{check.label}</li>
                    ))}
                </ul>
                <ul className="mt-2">
                    {packet.recommended_next_steps.map((step) => (
                        <li key={step.step_id}>{step.label}</li>
                    ))}
                </ul>
            </DiagnosticCard>
        </section>
    );
}

function DiagnosticCard({
    title,
    children,
}: {
    readonly title: string;
    readonly children: ReactNode;
}) {
    return (
        <div className="rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80) p-4">
            <h2 className="text-h3 font-semibold">{title}</h2>
            <div className="mt-2 text-sm text-(--ink-muted)">{children}</div>
        </div>
    );
}
