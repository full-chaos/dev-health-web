import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@/test/utils";

import { CredentialKindBadge } from "./CredentialKindBadge";

describe("CredentialKindBadge", () => {
    afterEach(cleanup);

    it("labels an external_push credential as External Push", () => {
        render(<CredentialKindBadge kind="external_push" />);
        expect(screen.getByText("External Push")).toBeInTheDocument();
        expect(screen.queryByText("Integration")).not.toBeInTheDocument();
    });

    it("labels an integration credential as Integration", () => {
        render(<CredentialKindBadge kind="integration" />);
        expect(screen.getByText("Integration")).toBeInTheDocument();
        expect(screen.queryByText("External Push")).not.toBeInTheDocument();
    });
});
