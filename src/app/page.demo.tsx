import { EvidenceDrawerProvider } from "@/components/evidence/EvidenceDrawerProvider";

import DemoPage from "./(app)/demo/page";

// The static demo export serves the demo page as "/" and skips the `(app)` layout, which is where
// the shared evidence drawer is mounted. Components on the page call `useEvidenceDrawer()`, so
// mount the same provider here.
export default function DemoRoot() {
    return (
        <EvidenceDrawerProvider>
            <DemoPage />
        </EvidenceDrawerProvider>
    );
}
