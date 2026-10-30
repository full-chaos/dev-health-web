import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shell/PageHeader";

import { ChartEscapeDemo } from "./ChartEscapeDemo";

// Test fixture, not a product page: NEXT_PUBLIC_DEV_HEALTH_TEST_MODE is inlined at build, so a
// production build answers 404 here. Used by tests/chart-tooltip-escape.spec.ts.
export default function ChartEscapePage() {
    if (process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE !== "true") notFound();
    return (
        <>
            <PageHeader
                title="Chart tooltip escaping"
                subtitle="Hostile served names render as literal text."
            />
            <ChartEscapeDemo />
        </>
    );
}
