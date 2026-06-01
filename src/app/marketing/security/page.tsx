import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/shared/LegalDocument";

export const metadata: Metadata = {
  title: "Security — Full Chaos Dev Health",
  description:
    "How Full Chaos Dev Health handles repository metadata, code hosting provider credentials, and customer data deletion.",
};

const sections: LegalSection[] = [
  {
    title: "Code storage",
    paragraphs: [
      "Full Chaos Dev Health does not clone, check out, or store customer repository source code.",
      "The product uses authorized API access to connected code hosting providers, such as GitHub and GitLab, to collect operational metadata and derived analytics. We read the metadata required to compute engineering-flow, investment-mix, quality, and developer-health metrics, and we persist only those operational records and the metrics derived from them.",
    ],
  },
  {
    title: "What repository data we collect",
    paragraphs: [
      "We retain operational and metadata records obtained through authorized code hosting provider API access (for example, GitHub and GitLab). We do not retain repository source code. The data we retain includes:",
    ],
    items: [
      "Repository identifiers and repository names.",
      "Pull requests, reviews, and review activity.",
      "Commits, commit statistics, and authorship metadata.",
      "File path and change metadata where needed to compute metrics.",
      "CI and deployment metadata.",
      "Security and dependency alert metadata where authorized.",
      "Cached analysis records and the derived metrics produced from the data above.",
    ],
  },
  {
    title: "Credential and token security",
    paragraphs: [
      "Provider credentials are secrets. For code hosting providers, Full Chaos Dev Health supports GitHub personal access tokens (PATs) or GitHub App authentication and GitLab access tokens; connected work-item providers such as Jira and Linear use their own API credentials. Local Git analysis uses a repository path and requires no stored provider credential.",
      "Credentials are encrypted at rest and are used server-side only for authorized API operations. Credential records are scoped by organization and workspace so they are accessible only within the tenant that provided them.",
      "Tokens are not exposed in dashboards, reports, exports, analytics views, client-side code, logs, or error traces.",
    ],
  },
  {
    title: "Tenant and workspace isolation",
    paragraphs: [
      "Integration credentials and the data they unlock are scoped to the organization and workspace that authorized them. One customer's credentials and metrics are not visible to, or usable by, another customer.",
      "Server-side access to a credential is limited to the authorized API operations performed on behalf of the workspace that owns it.",
    ],
  },
  {
    title: "Trial offboarding and data deletion",
    paragraphs: [
      "When a trial ends and the customer does not convert, Full Chaos Dev Health removes the customer workspace and associated retained data from active systems. Deleting an organization removes credentials, sync configuration, scheduled jobs, imported metadata, cached analysis records, and derived metrics from active systems. Specifically, offboarding:",
    ],
    items: [
      "Deletes the stored provider credentials for the workspace, including GitHub, GitLab, and any other connected integrations.",
      "Disables scheduled sync jobs and queued sync state for the workspace.",
      "Removes imported repository, pull request, commit, review, and security/dependency alert metadata for the workspace.",
      "Removes cached analysis records and derived metrics for the workspace from active systems.",
      "Invalidates workspace membership and access records.",
      "Lets backups expire under the platform backup retention policy, unless a stricter contractual requirement applies.",
    ],
  },
  {
    title: "Customer-controlled revocation",
    paragraphs: [
      "Customers can revoke Full Chaos Dev Health's access to a connected code hosting provider at any time, directly from that provider, without waiting on us.",
      "On GitHub, uninstall the GitHub App from your organization or revoke the personal access token used to connect. On GitLab, revoke the access token used to connect. Once access is revoked, further API collection from that provider stops.",
    ],
  },
  {
    title: "Security review summary",
    paragraphs: [
      "For security questionnaires, the key points are: source code is never cloned or stored; only operational metadata and derived analytics are retained through authorized code hosting provider API access (such as GitHub and GitLab); provider credentials are encrypted at rest, scoped by organization and workspace, used server-side only, and never surfaced in product output or logs; deleting an organization removes credentials, sync configuration, scheduled jobs, imported metadata, cached analysis records, and derived metrics from active systems; and customers can revoke access directly through their code hosting provider at any time.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      "Questions about this page or our security practices, including security-review and questionnaire requests, can be sent to support@fullchaos.studio, or through the Full Chaos Dev Health project contact channels published on our website or GitHub repository.",
    ],
  },
];

export default function SecurityPage() {
  return (
    <LegalDocument
      eyebrow="Trust"
      title="Security and Repository Data Handling"
      summary="How Full Chaos Dev Health handles source code, repository metadata, code hosting provider credentials, and trial offboarding."
      lastUpdated="June 1, 2026"
      sections={sections}
    />
  );
}
