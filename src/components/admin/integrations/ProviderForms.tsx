export function GitHubForm() {
    return (
        <>
            <div>
                <label
                    htmlFor="github-token"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    Personal access token
                </label>
                <div className="mt-1">
                    <input
                        type="password"
                        name="token"
                        id="github-token"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        placeholder="ghp_..."
                    />
                </div>
                <p className="mt-2 text-sm text-(--ink-muted)">
                    Required scopes: repo, read:org, read:user
                </p>
            </div>

            <div>
                <label
                    htmlFor="github-org"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    Organization / Owner
                </label>
                <div className="mt-1">
                    <input
                        type="text"
                        name="org"
                        id="github-org"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        placeholder="my-org"
                    />
                </div>
            </div>

            <p className="text-sm text-(--ink-muted)">
                Repositories are selected when creating a sync configuration.
            </p>

            {/* CHAOS-2837 AC6: manual GitHub App credential entry is a secondary,
                advanced path — the recommended one-click GitHub App install lives
                in the Add Provider wizard's auth-method step, not here. Collapsed
                by default so it never competes visually with the PAT field above. */}
            <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-(--ink-muted) hover:text-(--text-primary)">
                    Advanced: manual GitHub App credential
                </summary>
                <div className="mt-4 space-y-4">
                    <p className="text-sm text-(--ink-muted)">
                        Use an installation token backed by your GitHub App for higher
                        per-installation rate limits. Leave the token field above blank when these
                        fields are set.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label
                                htmlFor="github-app-id"
                                className="block text-sm font-medium text-(--text-primary)"
                            >
                                App ID
                            </label>
                            <div className="mt-1">
                                <input
                                    type="text"
                                    name="appId"
                                    id="github-app-id"
                                    className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                                    placeholder="123456"
                                />
                            </div>
                        </div>

                        <div>
                            <label
                                htmlFor="github-installation-id"
                                className="block text-sm font-medium text-(--text-primary)"
                            >
                                Installation ID
                            </label>
                            <div className="mt-1">
                                <input
                                    type="text"
                                    name="installationId"
                                    id="github-installation-id"
                                    className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                                    placeholder="987654"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="github-private-key"
                            className="block text-sm font-medium text-(--text-primary)"
                        >
                            Private key PEM
                        </label>
                        <div className="mt-1">
                            <textarea
                                name="privateKey"
                                id="github-private-key"
                                rows={6}
                                className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 font-mono text-sm text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action)"
                                placeholder="-----BEGIN PRIVATE KEY-----"
                            />
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="github-base-url"
                            className="block text-sm font-medium text-(--text-primary)"
                        >
                            API base URL
                        </label>
                        <div className="mt-1">
                            <input
                                type="url"
                                name="baseUrl"
                                id="github-base-url"
                                className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                                placeholder="https://api.github.com"
                            />
                        </div>
                    </div>
                </div>
            </details>
        </>
    );
}

export function GitLabForm() {
    return (
        <>
            <div>
                <label
                    htmlFor="gitlab-token"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    Personal Access Token
                </label>
                <div className="mt-1">
                    <input
                        type="password"
                        name="token"
                        id="gitlab-token"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        placeholder="glpat-..."
                    />
                </div>
                <p className="mt-2 text-sm text-(--ink-muted)">
                    Required scopes: api, read_repository
                </p>
            </div>

            <div>
                <label
                    htmlFor="gitlab-group"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    Group / Project Path
                </label>
                <div className="mt-1">
                    <input
                        type="text"
                        name="group"
                        id="gitlab-group"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        placeholder="my-group/my-project"
                    />
                </div>
            </div>
        </>
    );
}

export function JiraForm() {
    return (
        <>
            <div>
                <label
                    htmlFor="jira-url"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    Jira URL
                </label>
                <div className="mt-1">
                    <input
                        type="url"
                        name="url"
                        id="jira-url"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        placeholder="https://my-org.atlassian.net"
                    />
                </div>
            </div>

            <div>
                <label
                    htmlFor="jira-email"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    Email
                </label>
                <div className="mt-1">
                    <input
                        type="email"
                        name="email"
                        id="jira-email"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        placeholder="user@example.com"
                    />
                </div>
            </div>

            <div>
                <label
                    htmlFor="jira-token"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    API Token
                </label>
                <div className="mt-1">
                    <input
                        type="password"
                        name="api_token"
                        id="jira-token"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                    />
                </div>
            </div>

            <div>
                <label
                    htmlFor="jira-projects"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    Project Keys
                </label>
                <div className="mt-1">
                    <input
                        type="text"
                        name="projects"
                        id="jira-projects"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        placeholder="PROJ1, PROJ2"
                    />
                </div>
                <p className="mt-2 text-sm text-(--ink-muted)">
                    Comma-separated list of project keys to sync.
                </p>
            </div>
        </>
    );
}

export function LinearForm() {
    return (
        <>
            <div>
                <label
                    htmlFor="linear-key"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    API Key
                </label>
                <div className="mt-1">
                    <input
                        type="password"
                        name="apiKey"
                        id="linear-key"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        placeholder="lin_api_..."
                    />
                </div>
            </div>

            <div>
                <label
                    htmlFor="linear-teams"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    Team IDs (Optional)
                </label>
                <div className="mt-1">
                    <input
                        type="text"
                        name="teams"
                        id="linear-teams"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        placeholder="team-id-1, team-id-2"
                    />
                </div>
                <p className="mt-2 text-sm text-(--ink-muted)">
                    Comma-separated list of team IDs to sync. If empty, all teams will be synced.
                </p>
            </div>
        </>
    );
}

export function LaunchDarklyForm() {
    return (
        <>
            <div>
                <label
                    htmlFor="launchdarkly-token"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    API Token
                </label>
                <div className="mt-1">
                    <input
                        type="password"
                        name="api_key"
                        id="launchdarkly-token"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        placeholder="api-..."
                    />
                </div>
                <p className="mt-2 text-sm text-(--ink-muted)">
                    Recommended for long-lived sync jobs: LaunchDarkly service token with reader
                    access.
                </p>
            </div>

            <div>
                <label
                    htmlFor="launchdarkly-project"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    Project Key
                </label>
                <div className="mt-1">
                    <input
                        type="text"
                        name="project_key"
                        id="launchdarkly-project"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        placeholder="default"
                    />
                </div>
            </div>

            <div>
                <label
                    htmlFor="launchdarkly-environment"
                    className="block text-sm font-medium text-(--text-primary)"
                >
                    Environment Key
                </label>
                <div className="mt-1">
                    <input
                        type="text"
                        name="environment"
                        id="launchdarkly-environment"
                        className="block w-full rounded-md border-(--border) bg-(--surface) px-3 py-2 text-(--text-primary) shadow-sm focus:border-(--action) focus:outline-none focus:ring-1 focus:ring-(--action) sm:text-sm"
                        placeholder="production"
                    />
                </div>
            </div>
        </>
    );
}
