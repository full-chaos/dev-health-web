import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TeamImportSection } from "./TeamImportSection";
import type { AutoImportCapabilities } from "@/lib/admin/types";

const GITHUB_CAPABILITIES: AutoImportCapabilities = {
    github: {
        teams: true,
        projects: false,
        members: true,
        reasons: { projects: "GitHub attributes ownership via repos, not projects." },
    },
    gitlab: { teams: true, projects: true, members: true, reasons: {} },
};

describe("TeamImportSection", () => {
    it("renders nothing when the provider has no auto-import capability at all", () => {
        // Given: launchdarkly/pagerduty are absent from the capabilities map.
        const { container } = render(
            <TeamImportSection
                provider="launchdarkly"
                capabilities={GITHUB_CAPABILITIES}
                values={{ teams: false, projects: false, members: false }}
                onChange={vi.fn()}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing when capabilities is null (fetch failed, not just empty)", () => {
        // CHAOS-4323 codex round: null is a distinct sentinel from {} --
        // both hide the section (nothing safe to offer), but only the
        // caller's persistence logic (SyncConfigForm.buildSyncOptions) may
        // treat them differently.
        const { container } = render(
            <TeamImportSection
                provider="github"
                capabilities={null}
                values={{ teams: true, projects: false, members: true }}
                onChange={vi.fn()}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it("renders three checkboxes with the section heading, not 'Advanced options'", () => {
        render(
            <TeamImportSection
                provider="gitlab"
                capabilities={GITHUB_CAPABILITIES}
                values={{ teams: false, projects: false, members: false }}
                onChange={vi.fn()}
            />,
        );

        expect(screen.getByText("Import from provider during sync")).toBeInTheDocument();
        expect(screen.queryByText("Advanced options")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Import teams")).toBeInTheDocument();
        expect(screen.getByLabelText("Import projects")).toBeInTheDocument();
        expect(screen.getByLabelText("Import members")).toBeInTheDocument();
    });

    it("disables an unsupported category's checkbox and shows the capability's reason", () => {
        // Given: GitHub -- no "Projects" import (CHAOS-4323).
        render(
            <TeamImportSection
                provider="github"
                capabilities={GITHUB_CAPABILITIES}
                values={{ teams: true, projects: false, members: true }}
                onChange={vi.fn()}
            />,
        );

        const projectsCheckbox = screen.getByLabelText("Import projects");
        expect(projectsCheckbox).toBeDisabled();
        expect(
            screen.getByText("GitHub attributes ownership via repos, not projects."),
        ).toBeInTheDocument();

        const teamsCheckbox = screen.getByLabelText("Import teams");
        expect(teamsCheckbox).not.toBeDisabled();
        expect(teamsCheckbox).toBeChecked();
    });

    it("falls back to a generic reason when the capability omits one for a disabled category", () => {
        render(
            <TeamImportSection
                provider="github"
                capabilities={{
                    github: { teams: true, projects: false, members: true, reasons: {} },
                }}
                values={{ teams: false, projects: false, members: false }}
                onChange={vi.fn()}
            />,
        );

        expect(
            screen.getByText("This provider doesn't support team/project/member import."),
        ).toBeInTheDocument();
    });

    it("calls onChange with the category id when a supported checkbox is toggled", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <TeamImportSection
                provider="gitlab"
                capabilities={GITHUB_CAPABILITIES}
                values={{ teams: false, projects: false, members: false }}
                onChange={onChange}
            />,
        );

        await user.click(screen.getByLabelText("Import members"));

        expect(onChange).toHaveBeenCalledWith("members", true);
    });

    it("never checks an unsupported checkbox even if a stale value claims true", () => {
        // Defense-in-depth: values passed in should never render as checked
        // for a category the capability map marks unsupported, regardless of
        // what upstream state carries.
        render(
            <TeamImportSection
                provider="github"
                capabilities={GITHUB_CAPABILITIES}
                values={{ teams: false, projects: true, members: false }}
                onChange={vi.fn()}
            />,
        );

        expect(screen.getByLabelText("Import projects")).not.toBeChecked();
    });
});
