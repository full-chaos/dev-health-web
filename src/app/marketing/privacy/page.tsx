import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/shared/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy — Full Chaos Dev Health",
  description:
    "Learn what information Full Chaos Dev Health collects, how it is used, and the choices available to customers and end users.",
};

const sections: LegalSection[] = [
  {
    title: "Overview",
    paragraphs: [
      "This Privacy Policy explains how Full Chaos Studios, the team behind Full Chaos Dev Health, collects, uses, and protects information when you visit our website, create an account, start a trial, or use the hosted Full Chaos Dev Health service.",
      "Full Chaos Dev Health is also available as open-source software. If your organization self-hosts Full Chaos Dev Health, that organization controls its own deployment and data practices, and this policy applies only to information we handle for our own website and hosted service.",
    ],
  },
  {
    title: "Information we collect",
    paragraphs: [
      "We collect information you provide directly, information generated through your use of the service, and technical data required to operate and secure the platform.",
    ],
    items: [
      "Account and profile details, such as your name, work email address, password hash, organization name, and billing or subscription contacts.",
      "Workspace and integration data, including repository names, pull requests, commits, work-item metadata, deployment events, and related operational analytics imported from tools you connect.",
      "Product usage and diagnostic data, such as browser type, device identifiers, normalized route patterns, feature usage, filter counts, chart actions, session duration, timestamps, logs, error digests, and performance telemetry.",
      "Communications you send to us, including support requests, feedback, and sales or partnership inquiries.",
    ],
  },
  {
    title: "Product telemetry",
    paragraphs: [
      "We use first-party product telemetry to understand how our features are used and to improve the user experience. This data appears to lean toward aggregate patterns rather than individual tracking.",
      "Our telemetry system is designed with privacy in mind and explicitly excludes sensitive information. We do not collect:",
    ],
    items: [
      "Personal identifiers such as names, email addresses, or raw user IDs.",
      "Raw URLs, query strings, or search parameters that might contain sensitive data.",
      "Free-form text entered into the application, such as issue titles, PR descriptions, or comments.",
      "Source code, stack traces, or detailed error messages.",
    ],
  },
  {
    title: "How we use information",
    paragraphs: [
      "We use information to provide the service you request, maintain the security and reliability of the platform, improve the product, communicate with you, and comply with legal obligations.",
    ],
    items: [
      "Authenticate users, administer accounts, and provision organizations or trials.",
      "Import, process, and present analytics related to engineering flow, investment mix, quality, and developer health.",
      "Detect abuse, investigate incidents, prevent fraud, and monitor system performance.",
      "Respond to support requests, send transactional notices, and share important service updates.",
      "Analyze product usage so we can improve features, documentation, onboarding, and pricing.",
    ],
  },
  {
    title: "How we share information",
    paragraphs: [
      "We do not sell personal information. We share information only when necessary to run the service, comply with the law, or support a corporate transaction.",
    ],
    items: [
      "Service providers that support hosting, authentication, billing, analytics, customer support, and security operations.",
      "Third-party services you choose to connect, subject to the permissions and data you authorize through those integrations.",
      "Advisors, auditors, regulators, or law enforcement when disclosure is required by law or reasonably necessary to protect rights, safety, or the integrity of the service.",
      "A successor entity in connection with a merger, acquisition, financing, or sale of all or part of our business, subject to appropriate confidentiality obligations.",
    ],
  },
  {
    title: "Data retention",
    paragraphs: [
      "We retain information for as long as needed to provide the service, honor contractual commitments, resolve disputes, enforce our agreements, and satisfy legal or accounting requirements.",
      "Retention periods vary depending on the type of data, your subscription status, the settings available in your workspace, and whether we are required to preserve information for security or compliance reasons.",
    ],
  },
  {
    title: "Security",
    paragraphs: [
      "We use administrative, technical, and organizational safeguards designed to protect information from unauthorized access, loss, misuse, or alteration. No system is perfectly secure, so we cannot guarantee absolute security.",
      "You are responsible for maintaining the confidentiality of your credentials and for using the service in a manner consistent with your own security requirements.",
    ],
  },
  {
    title: "Your choices and rights",
    paragraphs: [
      "Depending on your location and relationship to Full Chaos Dev Health, you may have rights to access, correct, delete, or export your personal information, and to object to or restrict certain processing.",
      "You may also update account information in the product, disconnect integrations, or close your account. We may need to retain some information where required for legitimate business or legal purposes.",
    ],
  },
  {
    title: "International transfers",
    paragraphs: [
      "Full Chaos Dev Health may process information in countries other than the one where you live or work. When we transfer personal information across borders, we use appropriate safeguards as required by applicable law.",
    ],
  },
  {
    title: "Changes to this policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time to reflect product changes, legal developments, or operational requirements. When we make material changes, we will update the date above and, when appropriate, provide additional notice through the service or by email.",
    ],
  },
  {
    title: "Contact",
    paragraphs: [
      "Questions about this Privacy Policy or our privacy practices can be sent to support@fullchaos.studio, or through the Full Chaos Dev Health project contact channels published on our website or GitHub repository.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Privacy Policy"
      summary="How Full Chaos Dev Health collects, uses, shares, and safeguards information for our website and hosted service."
      lastUpdated="May 25, 2026"
      sections={sections}
    />
  );
}
