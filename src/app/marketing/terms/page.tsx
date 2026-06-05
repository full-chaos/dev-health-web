import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/shared/LegalDocument";

export const metadata: Metadata = {
    title: "Terms of Service — Full Chaos Dev Health",
    description:
        "Review the terms that govern access to the Full Chaos Dev Health website, hosted service, and related offerings.",
};

const sections: LegalSection[] = [
    {
        title: "Acceptance of these terms",
        paragraphs: [
            "These Terms of Service govern your access to and use of the Full Chaos Dev Health website, hosted application, APIs, trial environments, and related services provided by Full Chaos Studios.",
            'By accessing or using Full Chaos Dev Health, you agree to these Terms. If you use the service on behalf of an organization, you represent that you have authority to bind that organization, and "you" includes both you and that organization.',
        ],
    },
    {
        title: "Accounts and eligibility",
        paragraphs: [
            "You must provide accurate information when creating an account and keep that information current. You are responsible for all activity under your account and for maintaining the confidentiality of your login credentials.",
            "You may not use Full Chaos Dev Health if doing so would violate applicable law, export restrictions, or any binding obligation you owe to a third party.",
        ],
    },
    {
        title: "Use of the service",
        paragraphs: [
            "Subject to these Terms, we grant you a limited, non-exclusive, non-transferable right to access and use the hosted Full Chaos Dev Health service for your internal business purposes during the term of your subscription or trial.",
            "Full Chaos Dev Health may include beta or preview features. Those features may change, be interrupted, or be discontinued at any time, and may be subject to additional usage limits.",
        ],
    },
    {
        title: "Acceptable use",
        paragraphs: [
            "You may not misuse the service or interfere with its operation, security, or availability.",
        ],
        items: [
            "Do not attempt to gain unauthorized access to any account, system, or data.",
            "Do not reverse engineer, scrape, disrupt, overload, or probe the service in a way that could harm Full Chaos Dev Health or other users.",
            "Do not use the service to store or transmit unlawful, infringing, defamatory, or malicious content.",
            "Do not upload data or configure integrations unless you have the rights and permissions needed to do so.",
        ],
    },
    {
        title: "Customer data and responsibilities",
        paragraphs: [
            "You retain ownership of the data, content, and materials you submit to the hosted service or make available through integrations. You grant us the rights needed to host, process, transmit, and display that data solely to provide, secure, and improve Full Chaos Dev Health.",
            "You are responsible for the legality, quality, and accuracy of your data, for configuring integrations appropriately, and for providing any notices or obtaining any consents required by applicable law or your internal policies.",
        ],
    },
    {
        title: "Open-source components",
        paragraphs: [
            "Full Chaos Dev Health includes open-source software. Use of open-source components is subject to the applicable licenses that accompany those components. Nothing in these Terms limits rights you may have under those licenses.",
        ],
    },
    {
        title: "Fees, trials, and billing",
        paragraphs: [
            "Paid plans, if offered, are billed according to the pricing and billing terms presented to you at purchase. Unless otherwise stated, fees are non-refundable except where required by law.",
            "Trials and promotional access may be limited in duration, scope, or features. We may suspend or end trial access at the end of the trial period or earlier if necessary to protect the service.",
        ],
    },
    {
        title: "Third-party services",
        paragraphs: [
            "Full Chaos Dev Health interoperates with third-party platforms such as source control, ticketing, deployment, and identity providers. Your use of those third-party services is governed by your agreements with them, not by these Terms.",
            "We are not responsible for outages, data issues, or security incidents caused by third-party services or by permissions you choose to grant through those integrations.",
        ],
    },
    {
        title: "Termination",
        paragraphs: [
            "You may stop using the service at any time. We may suspend or terminate access if you violate these Terms, if continued access creates security or legal risk, or if fees remain unpaid after reasonable notice.",
            "Upon termination, your right to use the hosted service ends immediately. We may delete or return customer data according to our then-current retention and offboarding practices, subject to legal obligations.",
        ],
    },
    {
        title: "Disclaimers and limitation of liability",
        paragraphs: [
            'To the maximum extent permitted by law, Full Chaos Dev Health is provided "as is" and "as available" without warranties of any kind, whether express, implied, or statutory, including implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement.',
            "To the maximum extent permitted by law, Full Chaos Studios will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of profits, revenues, goodwill, data, or business opportunities arising from or related to the service.",
            "Our total liability for claims arising out of or relating to Full Chaos Dev Health will not exceed the amount you paid us for the service during the twelve months before the event giving rise to the claim, or one hundred U.S. dollars if you have not paid any fees.",
        ],
    },
    {
        title: "Changes to the service or terms",
        paragraphs: [
            "We may modify the service and these Terms from time to time. If we make material changes to these Terms, we will post the updated version and update the effective date above. Your continued use of Full Chaos Dev Health after the updated Terms take effect means you accept the revised Terms.",
        ],
    },
    {
        title: "Contact",
        paragraphs: [
            "Questions about these Terms can be sent to support@fullchaos.studio, or through the Full Chaos Dev Health project contact channels published on our website or GitHub repository.",
        ],
    },
];

export default function TermsPage() {
    return (
        <LegalDocument
            eyebrow="Legal"
            title="Terms of Service"
            summary="The rules that govern access to the Full Chaos Dev Health website, hosted service, trials, and related offerings."
            lastUpdated="April 4, 2026"
            sections={sections}
        />
    );
}
