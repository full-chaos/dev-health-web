import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, userEvent } from "@/test/utils";

// Mock the server action
vi.mock("@/lib/admin/server", () => ({
    listReposForCredential: vi.fn(),
}));

import { listReposForCredential } from "@/lib/admin/server";
import { RepoSelector } from "../RepoSelector";

const mockListRepos = vi.mocked(listReposForCredential);

const MOCK_REPOS = [
    {
        name: "repo-alpha",
        full_name: "myorg/repo-alpha",
        description: "Alpha repo",
        is_private: false,
        is_archived: false,
        default_branch: "main",
        language: "TypeScript",
        stargazers_count: 10,
        forks_count: 2,
        updated_at: "2024-01-01T00:00:00Z",
    },
    {
        name: "repo-beta",
        full_name: "myorg/repo-beta",
        description: null,
        is_private: true,
        is_archived: false,
        default_branch: "main",
        language: "Python",
        stargazers_count: 5,
        forks_count: 0,
        updated_at: "2024-01-02T00:00:00Z",
    },
    {
        name: "repo-gamma",
        full_name: "myorg/repo-gamma",
        description: "Gamma repo",
        is_private: false,
        is_archived: false,
        default_branch: "main",
        language: null,
        stargazers_count: 0,
        forks_count: 0,
        updated_at: null,
    },
];

function renderSelector(overrides: Partial<React.ComponentProps<typeof RepoSelector>> = {}) {
    const onSelectionChangeAction = vi.fn();
    render(
        <RepoSelector
            credentialId="cred-123"
            owner="myorg"
            selectedRepos={[]}
            onSelectionChangeAction={onSelectionChangeAction}
            {...overrides}
        />,
    );
    return { onSelectionChangeAction };
}

describe("RepoSelector", () => {
    beforeEach(() => {
        mockListRepos.mockReset();
    });

    describe("when credentialId or owner is empty", () => {
        it("shows a prompt to select credential and owner when credentialId is empty", () => {
            render(
                <RepoSelector
                    credentialId=""
                    owner="myorg"
                    selectedRepos={[]}
                    onSelectionChangeAction={vi.fn()}
                />,
            );
            expect(screen.getByText(/Select a credential and enter an owner/i)).toBeInTheDocument();
        });

        it("shows a prompt when owner is empty", () => {
            render(
                <RepoSelector
                    credentialId="cred-123"
                    owner=""
                    selectedRepos={[]}
                    onSelectionChangeAction={vi.fn()}
                />,
            );
            expect(screen.getByText(/Select a credential and enter an owner/i)).toBeInTheDocument();
        });
    });

    describe("loading state", () => {
        it("shows skeleton lines while fetching", async () => {
            // Never resolves during this test
            mockListRepos.mockReturnValue(new Promise(() => {}));
            renderSelector();
            // Skeleton lines rendered as divs with animate-pulse
            await waitFor(() => {
                // The skeleton container should be present before the list
                expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
            });
        });
    });

    describe("error state", () => {
        it("shows error message when fetch fails", async () => {
            mockListRepos.mockResolvedValue({ error: "Unauthorized" });
            renderSelector();
            await waitFor(() => {
                expect(
                    screen.getByText(/Failed to load repositories: Unauthorized/i),
                ).toBeInTheDocument();
            });
        });
    });

    describe("empty state", () => {
        it("shows empty message when no repos returned", async () => {
            mockListRepos.mockResolvedValue({
                data: { provider: "github", owner: "myorg", repos: [], total: 0 },
            });
            renderSelector();
            await waitFor(() => {
                expect(screen.getByText(/No repositories found/i)).toBeInTheDocument();
            });
        });
    });

    describe("with repos loaded", () => {
        beforeEach(() => {
            mockListRepos.mockResolvedValue({
                data: {
                    provider: "github",
                    owner: "myorg",
                    repos: MOCK_REPOS,
                    total: MOCK_REPOS.length,
                },
            });
        });

        it("renders all repos as checkboxes", async () => {
            renderSelector();
            await waitFor(() => {
                expect(screen.getByText("repo-alpha")).toBeInTheDocument();
                expect(screen.getByText("repo-beta")).toBeInTheDocument();
                expect(screen.getByText("repo-gamma")).toBeInTheDocument();
            });
        });

        it("shows repo description when available", async () => {
            renderSelector();
            await waitFor(() => {
                expect(screen.getByText("Alpha repo")).toBeInTheDocument();
            });
        });

        it("shows private badge for private repos", async () => {
            renderSelector();
            await waitFor(() => {
                expect(screen.getByText("private")).toBeInTheDocument();
            });
        });

        it("shows language when available", async () => {
            renderSelector();
            await waitFor(() => {
                expect(screen.getByText("TypeScript")).toBeInTheDocument();
            });
        });

        it("shows counter with 0 of N selected", async () => {
            renderSelector();
            await waitFor(() => {
                expect(screen.getByText(/0 of 3 selected/i)).toBeInTheDocument();
            });
        });

        it("shows limit in counter when maxRepos is set", async () => {
            renderSelector({ maxRepos: 5 });
            await waitFor(() => {
                expect(screen.getByText(/limit: 5/i)).toBeInTheDocument();
            });
        });

        it("calls onSelectionChange when a repo is checked", async () => {
            const { onSelectionChangeAction } = renderSelector();
            await waitFor(() => screen.getByText("repo-alpha"));

            const checkboxes = screen.getAllByRole("checkbox");
            await userEvent.click(checkboxes[0]);

            expect(onSelectionChangeAction).toHaveBeenCalledWith(["myorg/repo-alpha"]);
        });

        it("calls onSelectionChange to remove a repo when unchecked", async () => {
            const { onSelectionChangeAction } = renderSelector({
                selectedRepos: ["myorg/repo-alpha"],
            });
            await waitFor(() => screen.getByText("repo-alpha"));

            const checkboxes = screen.getAllByRole("checkbox");
            await userEvent.click(checkboxes[0]);

            expect(onSelectionChangeAction).toHaveBeenCalledWith([]);
        });

        it("Select All selects all repos", async () => {
            const { onSelectionChangeAction } = renderSelector();
            await waitFor(() => screen.getByRole("button", { name: "Select All" }));

            await userEvent.click(screen.getByRole("button", { name: "Select All" }));

            expect(onSelectionChangeAction).toHaveBeenCalledWith([
                "myorg/repo-alpha",
                "myorg/repo-beta",
                "myorg/repo-gamma",
            ]);
        });

        it("Select All respects maxRepos limit", async () => {
            const { onSelectionChangeAction } = renderSelector({ maxRepos: 2 });
            await waitFor(() => screen.getByRole("button", { name: "Select All" }));

            await userEvent.click(screen.getByRole("button", { name: "Select All" }));

            expect(onSelectionChangeAction).toHaveBeenCalledWith([
                "myorg/repo-alpha",
                "myorg/repo-beta",
            ]);
        });

        it("Clear clears all selected repos", async () => {
            const { onSelectionChangeAction } = renderSelector({
                selectedRepos: ["myorg/repo-alpha", "myorg/repo-beta"],
            });
            await waitFor(() => screen.getByRole("button", { name: "Clear" }));

            await userEvent.click(screen.getByRole("button", { name: "Clear" }));

            expect(onSelectionChangeAction).toHaveBeenCalledWith([]);
        });

        it("disables unchecked repos when at maxRepos", async () => {
            renderSelector({ selectedRepos: ["myorg/repo-alpha"], maxRepos: 1 });
            await waitFor(() => screen.getByText("repo-beta"));

            const checkboxes = screen.getAllByRole("checkbox");
            // First checkbox (repo-alpha) is checked, not disabled
            expect(checkboxes[0]).not.toBeDisabled();
            // Second and third (repo-beta, repo-gamma) should be disabled
            expect(checkboxes[1]).toBeDisabled();
            expect(checkboxes[2]).toBeDisabled();
        });

        it("filters repos by search text", async () => {
            renderSelector();
            await waitFor(() => screen.getByText("repo-alpha"));

            const searchInput = screen.getByPlaceholderText("Search repositories...");
            await userEvent.type(searchInput, "alpha");

            expect(screen.getByText("repo-alpha")).toBeInTheDocument();
            expect(screen.queryByText("repo-beta")).not.toBeInTheDocument();
        });

        it("filters repos by full name", async () => {
            renderSelector();
            await waitFor(() => screen.getByText("repo-alpha"));

            const searchInput = screen.getByPlaceholderText("Search repositories...");
            await userEvent.type(searchInput, "myorg/repo-beta");

            expect(screen.getByText("repo-beta")).toBeInTheDocument();
            expect(screen.queryByText("repo-alpha")).not.toBeInTheDocument();
        });

        it("shows empty search message when no repos match", async () => {
            renderSelector();
            await waitFor(() => screen.getByText("repo-alpha"));

            const searchInput = screen.getByPlaceholderText("Search repositories...");
            await userEvent.type(searchInput, "zzznomatch");

            expect(screen.getByText(/No repositories match your search/i)).toBeInTheDocument();
        });
    });

    describe("refetch on prop change", () => {
        it("re-fetches when owner changes", async () => {
            mockListRepos.mockResolvedValue({
                data: {
                    provider: "github",
                    owner: "myorg",
                    repos: MOCK_REPOS,
                    total: MOCK_REPOS.length,
                },
            });

            const { rerender } = render(
                <RepoSelector
                    credentialId="cred-123"
                    owner="myorg"
                    selectedRepos={[]}
                    onSelectionChangeAction={vi.fn()}
                />,
            );

            await waitFor(() => screen.getByText("repo-alpha"));
            expect(mockListRepos).toHaveBeenCalledTimes(1);

            mockListRepos.mockResolvedValue({
                data: { provider: "github", owner: "otherorg", repos: [], total: 0 },
            });

            rerender(
                <RepoSelector
                    credentialId="cred-123"
                    owner="otherorg"
                    selectedRepos={[]}
                    onSelectionChangeAction={vi.fn()}
                />,
            );

            await waitFor(() => expect(mockListRepos).toHaveBeenCalledTimes(2));
            expect(mockListRepos).toHaveBeenLastCalledWith("cred-123", "otherorg");
        });
    });
});
