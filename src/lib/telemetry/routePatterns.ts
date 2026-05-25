const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function routePatternForPathname(input: string): string {
  const pathname = input.split("?")[0].split("#")[0] || "/";
  const parts = pathname.split("/").filter(Boolean);

  if (parts[0] === "people" && parts[1] && parts[2] === "metrics" && parts[3]) {
    return "/people/[person_id]/metrics/[metric]";
  }
  if (parts[0] === "people" && parts[1]) return "/people/[person_id]";
  if (parts[0] === "reports" && parts[1] === "new") return "/reports/new";
  if (parts[0] === "reports" && parts[1]) return "/reports/[id]";
  if (parts[0] === "prs" && parts[1]) return "/prs/[pr_id]";
  if (parts[0] === "issues" && parts[1]) return "/issues/[issue_id]";
  if (parts[0] === "deployments" && parts[1]) return "/deployments/[deployment_id]";
  if (parts[0] === "security" && parts[1] === "repos" && parts[2]) return "/security/repos/[repoId]";

  const normalized = parts.map((part) => (UUID_RE.test(part) ? "[id]" : part));
  return `/${normalized.join("/")}`;
}
