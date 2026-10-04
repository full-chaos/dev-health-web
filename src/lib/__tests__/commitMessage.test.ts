import { describe, expect, it } from "vitest";

import { commitMessageWithoutTrailers } from "@/lib/prs/commitMessage";

describe("commitMessageWithoutTrailers (CHAOS-8504)", () => {
    it("drops the Co-authored-by and Signed-off-by lines and keeps the rest", () => {
        const message = [
            "fix: handle empty input",
            "",
            "Body line.",
            "",
            "Co-authored-by: Ana Fake <ana.fake@example.test>",
            "Signed-off-by: Bo Fake <bo.fake@example.test>",
        ].join("\n");
        expect(commitMessageWithoutTrailers(message)).toBe("fix: handle empty input\n\nBody line.");
    });

    it("keeps a line with an @ in the body (package and action references)", () => {
        const message = "chore: bump lodash@4.17.21 and actions/checkout@v4\n\nSee a@b.example.";
        expect(commitMessageWithoutTrailers(message)).toBe(message);
    });

    it("leaves a message with no trailer as served", () => {
        expect(commitMessageWithoutTrailers("commit message")).toBe("commit message");
    });

    it("matches the trailer key case-insensitively, at the start of a line only, with CRLF", () => {
        const message =
            "subject\r\nco-authored-by: X <x@example.test>\r\nnote: Co-authored-by: is a trailer";
        expect(commitMessageWithoutTrailers(message)).toBe(
            "subject\nnote: Co-authored-by: is a trailer",
        );
    });
});
