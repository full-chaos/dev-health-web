import { Notice } from "@/components/ui/Notice";

/**
 * How to read WIP Saturation on the Bottlenecks page. The text is production's, word for word
 * (`bottleneck/page.tsx` before the page pass); it renders with the page, so it is not a live region.
 */
export function WipSaturationNotice() {
    return (
        <Notice variant="info" live={false} data-testid="wip-saturation-notice">
            WIP Saturation is indexed to a baseline of 100% (work in progress matched to typical
            throughput). Readings above 100% mean more work is open than the team usually clears in
            the window &mdash; e.g. 950% reads as ~9.5&times; the baseline, not a data error.
            Sustained readings far above 100% point to over-commitment, and the metric is
            intentionally uncapped so that severity stays visible.
        </Notice>
    );
}
