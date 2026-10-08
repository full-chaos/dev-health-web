import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";

import { PersonEvidenceTable } from "./PersonEvidenceTable";

const REPO_ID = "0b1f6a52-6f0b-4f4e-9d0a-1c2d3e4f5a61";
const ITEM_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const cells = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("tbody tr:first-child td")).map((td) => td.textContent);

describe("PersonEvidenceTable served names (CHAOS-8955)", () => {
    it("pull requests show the served repo_name, never the repo id", () => {
        const { container } = render(
            <PersonEvidenceTable
                type="prs"
                fallbackHref="/x"
                items={[{ title: "Fix login", number: 3, repo_id: REPO_ID, repo_name: "org/web" }]}
            />,
        );
        expect(cells(container)[1]).toBe("org/web");
        expect(container.textContent).not.toContain(REPO_ID);
    });

    it("a pull request with no repo_name reads Unresolved", () => {
        const { container } = render(
            <PersonEvidenceTable
                type="prs"
                fallbackHref="/x"
                items={[
                    { number: 3, repo_id: REPO_ID },
                    { number: 4, repo_id: REPO_ID, repo_name: null },
                ]}
            />,
        );
        const rows = Array.from(container.querySelectorAll("tbody tr"));
        for (const row of rows) {
            expect(within(row as HTMLElement).getByText("Unresolved")).toBeInTheDocument();
        }
        expect(container.textContent).not.toContain(REPO_ID);
    });

    it("issues show the served title and the repo_names of their linked pull requests", () => {
        const { container } = render(
            <PersonEvidenceTable
                type="issues"
                fallbackHref="/x"
                items={[
                    {
                        work_item_id: ITEM_ID,
                        title: "Slow build",
                        repo_names: ["org/api", "org/web"],
                        provider: "jira",
                        status: "done",
                    },
                ]}
            />,
        );
        const [item, repos] = cells(container);
        expect(item).toBe("Slow build");
        expect(repos).toBe("org/api, org/web");
        expect(container.textContent).not.toContain(ITEM_ID);
    });

    it("an issue with no title reads Unresolved, and no linked repos reads a dash", () => {
        const { container } = render(
            <PersonEvidenceTable
                type="issues"
                fallbackHref="/x"
                items={[{ work_item_id: ITEM_ID, title: null, repo_names: [], provider: "jira" }]}
            />,
        );
        const [item, repos] = cells(container);
        expect(item).toBe("Unresolved");
        expect(repos).toBe("—");
        expect(container.textContent).not.toContain(ITEM_ID);
    });
});
