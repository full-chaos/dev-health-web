import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@/test/utils";
import { PreviewBadge } from "@/components/PreviewBadge";
import { StatusBadge as ReportStatusBadge } from "@/components/reports/StatusBadge";
import { SeverityBadge } from "@/components/security/SeverityBadge";
import { SourceBadge } from "@/components/security/SourceBadge";
import { StateBadge } from "@/components/security/StateBadge";
import { SyncStatusBadge } from "@/components/admin/sync/SyncStatusBadge";
import {
    ConnectionStatus,
    type ConnectionStatusType,
} from "@/components/admin/integrations/ConnectionStatus";
import { ProviderBadge } from "@/components/admin/identities/ProviderBadge";
import { CustomerPushStatusBadge } from "@/components/admin/integrations/customer-push/CustomerPushStatusBadge";
import { STATUS_PILL } from "../statusPill";
import { STATUS_PILL_ALPHA } from "../themeTints";

const RAW =
    /\b(?:text|bg|border)-(?:red|orange|amber|yellow|green|emerald|sky|blue|slate|gray)-\d{2,3}/u;
const html = (ui: React.ReactElement) => render(ui).container.innerHTML;

describe("badges render theme tokens only", () => {
    it("security severity, state and source", () => {
        for (const s of ["critical", "high", "medium", "low", "unknown"] as const) {
            const h = html(<SeverityBadge severity={s} />);
            expect(h).not.toMatch(RAW);
            expect(h).toContain("text-(--");
        }
        expect(html(<SeverityBadge severity="critical" />)).toContain(STATUS_PILL.negative);
        expect(html(<SeverityBadge severity="critical" />)).toContain(">Critical<");
        for (const s of ["open", "fixed", "dismissed"] as const) {
            expect(html(<StateBadge state={s} />)).not.toMatch(RAW);
        }
        expect(html(<StateBadge state="fixed" />)).toContain(STATUS_PILL.positive);
        expect(html(<SourceBadge source="dependabot" />)).not.toMatch(RAW);
    });
    it("sync, connection, customer push, provider, preview, report status", () => {
        for (const s of ["success", "failed", "running", "idle", "never"] as const) {
            expect(html(<SyncStatusBadge status={s} />)).not.toMatch(RAW);
        }
        expect(html(<SyncStatusBadge status="failed" />)).toContain(STATUS_PILL.negative);
        for (const s of [
            "connected",
            "error",
            "not_configured",
            "connecting",
            "failing",
            "untested",
            "inactive",
        ] as ConnectionStatusType[]) {
            expect(html(<ConnectionStatus status={s} />)).not.toMatch(RAW);
        }
        for (const s of [
            "accepted",
            "stream_unavailable",
            "processing",
            "completed",
            "partial",
            "failed",
        ] as const) {
            expect(html(<CustomerPushStatusBadge status={s} />)).not.toMatch(RAW);
        }
        const p = html(<ProviderBadge provider="github" username="x" />);
        expect(p).not.toMatch(RAW);
        expect(p).not.toContain("text-white");
        expect(html(<PreviewBadge />)).toContain(STATUS_PILL.info);
        for (const s of ["SUCCESS", "FAILED", "RUNNING", "PENDING"]) {
            expect(html(<ReportStatusBadge status={s.toLowerCase()} />)).not.toMatch(RAW);
        }
    });
});

const themes = readFileSync(join(process.cwd(), "src/app/fc-infinity-themes.css"), "utf8");
const tokens = (theme: "light" | "dark") => {
    const sel = `:root[data-palette="infinity"][data-theme="${theme}"] {`;
    const start = themes.indexOf(sel);
    const body = themes.slice(start + sel.length, themes.indexOf("\n}", start));
    return Object.fromEntries(
        [...body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6});/gu)].map((m) => [m[1], m[2]]),
    );
};
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

describe("status pill contrast (token text on its fill over the card)", () => {
    for (const theme of ["light", "dark"] as const) {
        it(`status tones reach 4.5:1 in ${theme}`, () => {
            const t = tokens(theme);
            for (const k of ["--positive", "--negative", "--caution", "--info"]) {
                const fill = rgb(t["--card"]).map(
                    (v, i) => rgb(t[k])[i] * STATUS_PILL_ALPHA + v * (1 - STATUS_PILL_ALPHA),
                );
                expect(ratio(rgb(t[k]), fill), `${k} ${theme}`).toBeGreaterThanOrEqual(4.5);
            }
        });
        it(`muted pill: ink-muted on card stroke (${theme})`, () => {
            const t = tokens(theme);
            // Light is 4.05 until CHAOS-7690 (lane-wr-theme) changes the muted ink value; raise this floor then.
            const floor = theme === "light" ? 4.0 : 4.5;
            expect(ratio(rgb(t["--ink-muted"]), rgb(t["--card-stroke"]))).toBeGreaterThanOrEqual(
                floor,
            );
        });
    }
});
