import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import type { ActiveOrganizationData } from "@/components/navigation/OrgSwitcher";

import { ShellOrganizationProvider, useShellOrganization } from "../ShellContext";

const FALLBACK = "Organization";
const ORGANIZATION: ActiveOrganizationData = {
    name: "E2E Organization",
    hasData: true,
    lastMetricsAt: null,
};

/** What each render of the consumer got from the hook, in order. */
const seen: (string | undefined)[] = [];

// The shape of the scope bar's label: the name, or the fallback the server renders.
function OrganizationLabel() {
    const organization = useShellOrganization();
    seen.push(organization?.name);
    return <button type="button">{organization?.name ?? FALLBACK}</button>;
}

function Tree({ organization }: { organization: ActiveOrganizationData | undefined }) {
    return (
        <ShellOrganizationProvider value={organization}>
            <OrganizationLabel />
        </ShellOrganizationProvider>
    );
}

describe("useShellOrganization across hydration", () => {
    let root: Root | undefined;

    afterEach(() => {
        act(() => root?.unmount());
        root = undefined;
        document.body.innerHTML = "";
        seen.length = 0;
    });

    // The server never knows the organization: the sidebar card loads it in the
    // browser. A consumer in a streamed Suspense boundary can hydrate after the
    // answer is there. That is the state this test makes: server HTML without the
    // organization, hydration with it (CHAOS-8134, React error #418).
    it("gives the hydration render what the server render got", async () => {
        const container = document.createElement("div");
        document.body.append(container);
        container.innerHTML = renderToString(<Tree organization={undefined} />);
        const serverButton = container.querySelector("button");
        expect(serverButton?.textContent).toBe(FALLBACK);
        seen.length = 0;

        const recoverable: string[] = [];
        await act(async () => {
            root = hydrateRoot(container, <Tree organization={ORGANIZATION} />, {
                onRecoverableError: (error) => recoverable.push(String(error)),
            });
        });

        // The mechanism: no hydration mismatch, and the server node is hydrated,
        // not made again on the client.
        expect(recoverable).toEqual([]);
        expect(container.querySelector("button")).toBe(serverButton);
        expect(seen[0]).toBeUndefined();
        // The outcome: the label shows the organization after hydration.
        expect(serverButton?.textContent).toBe(ORGANIZATION.name);
    });

    // A client navigation is not a hydration: the first render must have the
    // organization, so the fallback text does not show for a frame.
    it("gives a client render the organization in its first render", async () => {
        const container = document.createElement("div");
        document.body.append(container);

        await act(async () => {
            root = createRoot(container);
            root.render(<Tree organization={ORGANIZATION} />);
        });

        expect(seen[0]).toBe(ORGANIZATION.name);
        expect(container.querySelector("button")?.textContent).toBe(ORGANIZATION.name);
    });
});
