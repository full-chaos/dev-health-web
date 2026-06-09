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
