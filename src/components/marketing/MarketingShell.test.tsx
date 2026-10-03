import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { metadata } from "@/app/(marketing)/layout";
import { expectStaticLogo } from "@/test/staticLogo";

import { MarketingShell } from "./MarketingShell";

// `next/image` is not mocked: the logo test below reads what it renders.

describe("MarketingShell brand", () => {
    it("draws the logo from the small static file, in its 44 x 40 box (CHAOS-8545)", () => {
        render(
            <MarketingShell>
                <p>content</p>
            </MarketingShell>,
        );

        const logo = screen.getByRole("img", { name: "Full Chaos Dev Health logo" });
        expectStaticLogo(logo, { file: "fc-logo-120.webp", width: 44, height: 40 });
        expect(logo).toHaveClass("h-10", "w-auto");
    });

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
