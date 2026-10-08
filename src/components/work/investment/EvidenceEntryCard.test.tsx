/**
 * EvidenceEntryCard unit tests.
 *
 * Verifies that the card renders a record's own fields as labeled rows rather
 * than a raw JSON dump, and handles edge-cases cleanly.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { EvidenceEntryCard } from "./EvidenceEntryCard";

describe("EvidenceEntryCard", () => {
    it("renders a labeled row for each field in the entry", () => {
        render(
            <EvidenceEntryCard
                entry={{ file_path: "src/lib/foo.ts", change_type: "modified", lines: 42 }}
            />,
        );

        // Labels should be humanised (snake_case → Title Case)
        expect(screen.getByText(/file path:/i)).toBeInTheDocument();
        expect(screen.getByText(/change type:/i)).toBeInTheDocument();
        expect(screen.getByText(/lines:/i)).toBeInTheDocument();

        // Values should appear as plain strings, not raw JSON
        expect(screen.getByText("src/lib/foo.ts")).toBeInTheDocument();
        expect(screen.getByText("modified")).toBeInTheDocument();
        expect(screen.getByText("42")).toBeInTheDocument();

        // Should NOT contain a raw JSON dump of the whole record
        expect(screen.queryByText(/\{"file_path"/)).not.toBeInTheDocument();
    });

    it("shows a muted dash when the entry has no fields", () => {
        render(<EvidenceEntryCard entry={{}} />);
        expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("renders nested objects as compact JSON strings", () => {
        render(<EvidenceEntryCard entry={{ meta: { author: "alice", count: 3 } }} />);
        expect(screen.getByText(/meta:/i)).toBeInTheDocument();
        // The value is compact JSON of the nested object
        expect(screen.getByText('{"author":"alice","count":3}')).toBeInTheDocument();
    });

    it("renders null values as a dash", () => {
        render(<EvidenceEntryCard entry={{ score: null }} />);
        expect(screen.getByText(/score:/i)).toBeInTheDocument();
        expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("renders boolean values as strings", () => {
        render(<EvidenceEntryCard entry={{ is_primary: true }} />);
        expect(screen.getByText(/is primary:/i)).toBeInTheDocument();
        expect(screen.getByText("true")).toBeInTheDocument();
    });

    it("humanises camelCase keys as well as snake_case", () => {
        render(<EvidenceEntryCard entry={{ changeType: "added" }} />);
        // camelCase → "Change Type:"
        expect(screen.getByText(/change type:/i)).toBeInTheDocument();
    });
});

describe("EvidenceEntryCard evidence_quote", () => {
    const id = "0b8f6a52-1c3d-4e5f-8a9b-0c1d2e3f4a5b";

    it("shows the served source title and not the source id", () => {
        render(
            <EvidenceEntryCard
                entry={{
                    type: "evidence_quote",
                    quote: "Fix login",
                    source: "issue",
                    id,
                    source_title: "Fix login redirect",
                }}
            />,
        );
        expect(screen.getByText("Fix login redirect")).toBeInTheDocument();
        expect(screen.queryByText(id)).not.toBeInTheDocument();
    });

    it("shows Unresolved when the title is null or absent", () => {
        const { unmount } = render(
            <EvidenceEntryCard
                entry={{ type: "evidence_quote", quote: "q", source: "pr", id, source_title: null }}
            />,
        );
        expect(screen.getByText("Unresolved")).toBeInTheDocument();
        expect(screen.queryByText(id)).not.toBeInTheDocument();
        unmount();
        render(
            <EvidenceEntryCard entry={{ type: "evidence_quote", quote: "q", source: "pr", id }} />,
        );
        expect(screen.getByText("Unresolved")).toBeInTheDocument();
    });

    it("keeps a commit hash and adds no title row", () => {
        render(
            <EvidenceEntryCard
                entry={{
                    type: "evidence_quote",
                    quote: "q",
                    source: "commit",
                    id: "9f59478d",
                    source_title: null,
                }}
            />,
        );
        expect(screen.getByText("9f59478d")).toBeInTheDocument();
        expect(screen.queryByText("Unresolved")).not.toBeInTheDocument();
    });
});
