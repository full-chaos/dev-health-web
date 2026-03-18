export function GitHubForm() {
  return (
    <>
      <div>
        <label htmlFor="github-token" className="block text-sm font-medium text-(--ink-base)">
          Personal Access Token
        </label>
        <div className="mt-1">
          <input
            type="password"
            name="token"
            id="github-token"
            className="block w-full rounded-md border-(--border-base) bg-(--surface-base) px-3 py-2 text-(--ink-base) shadow-sm focus:border-(--surface-inverted) focus:outline-none focus:ring-1 focus:ring-(--surface-inverted) sm:text-sm"
            placeholder="ghp_..."
          />
        </div>
        <p className="mt-2 text-sm text-(--ink-muted)">
          Required scopes: repo, read:org, read:user
        </p>
      </div>

      <div>
        <label htmlFor="github-org" className="block text-sm font-medium text-(--ink-base)">
          Organization / Owner
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="org"
            id="github-org"
            className="block w-full rounded-md border-(--border-base) bg-(--surface-base) px-3 py-2 text-(--ink-base) shadow-sm focus:border-(--surface-inverted) focus:outline-none focus:ring-1 focus:ring-(--surface-inverted) sm:text-sm"
            placeholder="my-org"
          />
        </div>
      </div>

      <p className="text-sm text-(--ink-muted)">
        Repositories are selected when creating a sync configuration.
      </p>
    </>
  );
}

export function GitLabForm() {
  return (
    <>
      <div>
        <label htmlFor="gitlab-token" className="block text-sm font-medium text-(--ink-base)">
          Personal Access Token
        </label>
        <div className="mt-1">
          <input
            type="password"
            name="token"
            id="gitlab-token"
            className="block w-full rounded-md border-(--border-base) bg-(--surface-base) px-3 py-2 text-(--ink-base) shadow-sm focus:border-(--surface-inverted) focus:outline-none focus:ring-1 focus:ring-(--surface-inverted) sm:text-sm"
            placeholder="glpat-..."
          />
        </div>
        <p className="mt-2 text-sm text-(--ink-muted)">
          Required scopes: api, read_repository
        </p>
      </div>

      <div>
        <label htmlFor="gitlab-group" className="block text-sm font-medium text-(--ink-base)">
          Group / Project Path
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="group"
            id="gitlab-group"
            className="block w-full rounded-md border-(--border-base) bg-(--surface-base) px-3 py-2 text-(--ink-base) shadow-sm focus:border-(--surface-inverted) focus:outline-none focus:ring-1 focus:ring-(--surface-inverted) sm:text-sm"
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
        <label htmlFor="jira-url" className="block text-sm font-medium text-(--ink-base)">
          Jira URL
        </label>
        <div className="mt-1">
          <input
            type="url"
            name="url"
            id="jira-url"
            className="block w-full rounded-md border-(--border-base) bg-(--surface-base) px-3 py-2 text-(--ink-base) shadow-sm focus:border-(--surface-inverted) focus:outline-none focus:ring-1 focus:ring-(--surface-inverted) sm:text-sm"
            placeholder="https://my-org.atlassian.net"
          />
        </div>
      </div>

      <div>
        <label htmlFor="jira-email" className="block text-sm font-medium text-(--ink-base)">
          Email
        </label>
        <div className="mt-1">
          <input
            type="email"
            name="email"
            id="jira-email"
            className="block w-full rounded-md border-(--border-base) bg-(--surface-base) px-3 py-2 text-(--ink-base) shadow-sm focus:border-(--surface-inverted) focus:outline-none focus:ring-1 focus:ring-(--surface-inverted) sm:text-sm"
            placeholder="user@example.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="jira-token" className="block text-sm font-medium text-(--ink-base)">
          API Token
        </label>
        <div className="mt-1">
          <input
            type="password"
            name="token"
            id="jira-token"
            className="block w-full rounded-md border-(--border-base) bg-(--surface-base) px-3 py-2 text-(--ink-base) shadow-sm focus:border-(--surface-inverted) focus:outline-none focus:ring-1 focus:ring-(--surface-inverted) sm:text-sm"
          />
        </div>
      </div>

      <div>
        <label htmlFor="jira-projects" className="block text-sm font-medium text-(--ink-base)">
          Project Keys
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="projects"
            id="jira-projects"
            className="block w-full rounded-md border-(--border-base) bg-(--surface-base) px-3 py-2 text-(--ink-base) shadow-sm focus:border-(--surface-inverted) focus:outline-none focus:ring-1 focus:ring-(--surface-inverted) sm:text-sm"
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
        <label htmlFor="linear-key" className="block text-sm font-medium text-(--ink-base)">
          API Key
        </label>
        <div className="mt-1">
          <input
            type="password"
            name="apiKey"
            id="linear-key"
            className="block w-full rounded-md border-(--border-base) bg-(--surface-base) px-3 py-2 text-(--ink-base) shadow-sm focus:border-(--surface-inverted) focus:outline-none focus:ring-1 focus:ring-(--surface-inverted) sm:text-sm"
            placeholder="lin_api_..."
          />
        </div>
      </div>

      <div>
        <label htmlFor="linear-teams" className="block text-sm font-medium text-(--ink-base)">
          Team IDs (Optional)
        </label>
        <div className="mt-1">
          <input
            type="text"
            name="teams"
            id="linear-teams"
            className="block w-full rounded-md border-(--border-base) bg-(--surface-base) px-3 py-2 text-(--ink-base) shadow-sm focus:border-(--surface-inverted) focus:outline-none focus:ring-1 focus:ring-(--surface-inverted) sm:text-sm"
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
