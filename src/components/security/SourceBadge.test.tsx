/** SourceBadge component tests — CHAOS-1240. */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@/test/utils";
import { SourceBadge } from "./SourceBadge";
import type { SecuritySource } from "@/lib/filters/security";

describe("SourceBadge", () => {
    afterEach(() => cleanup());

    it.each<[SecuritySource, string]>([
        ["dependabot", "Dependabot"],
        ["code_scanning", "Code Scanning"],
        ["advisory", "Advisory"],
        ["gitlab_vulnerability", "GitLab Vuln"],
        ["gitlab_dependency", "GitLab Deps"],
    ])("renders the friendly label for source=%s", (source, label) => {
        render(<SourceBadge source={source} />);
        expect(screen.getByText(label)).toBeInTheDocument();
    });

    it("falls back to the raw value for unrecognized sources", () => {
        render(<SourceBadge source={"custom_feed" as SecuritySource} />);
        expect(screen.getByText("custom_feed")).toBeInTheDocument();
    });

    it("applies the neutral slate palette", () => {
        render(<SourceBadge source="dependabot" />);
        const badge = screen.getByText("Dependabot");
        expect(badge.className).toContain("bg-slate-100");
        expect(badge.className).toContain("text-slate-700");
    });
});
