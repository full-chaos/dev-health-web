import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { metadata } from "@/app/(marketing)/layout";

import { MarketingShell } from "./MarketingShell";

vi.mock("next/image", () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

describe("MarketingShell brand", () => {
    it("shows the OSS mark and no Beta mark in the header", () => {
        render(
            <MarketingShell>
                <p>content</p>
            </MarketingShell>,
        );
        expect(screen.getByText("OSS")).toBeInTheDocument();
        expect(screen.queryByText(/^beta$/i)).toBeNull();
    });
});

describe("marketing home metadata", () => {
    it("has no Beta in the page, Open Graph or Twitter titles; the rest is unchanged", () => {
        expect(metadata.title).toBe(
            "Full Chaos Dev Health — Where is your engineering effort going?",
        );
        expect(metadata.openGraph?.title).toBe(
            "Full Chaos Dev Health — Engineering Effort Analytics",
        );
        expect(metadata.twitter?.title).toBe(
            "Full Chaos Dev Health — Engineering Effort Analytics",
        );
    });
});
