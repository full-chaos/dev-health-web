import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { LegalDocument } from "./LegalDocument";

describe("LegalDocument", () => {
  it("renders the document heading, updated date, and sections", () => {
    render(
      <LegalDocument
        eyebrow="Legal"
        title="Privacy Policy"
        summary="How Full Chaos Dev Health collects, uses, and protects information."
        lastUpdated="April 4, 2026"
        sections={[
          {
            title: "Information we collect",
            paragraphs: ["We collect account details and service usage data."],
            items: ["Account profile details", "Product usage diagnostics"],
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Last updated: April 4, 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Information we collect", level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Account profile details")).toBeInTheDocument();
  });
});
