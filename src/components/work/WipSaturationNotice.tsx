import { Notice } from "@/components/ui/Notice";

/**
 * How to read WIP Saturation on the Bottlenecks page: the approved prototype's one-line notice
 * (`bottlenecks()`, app.js). The prototype's 468% is captured data, so no number is named. It
 * renders with the page, so it is not a live region.
 */
export function WipSaturationNotice() {
    return (
        <Notice variant="info" live={false} data-testid="wip-saturation-notice">
            <strong>WIP saturation is uncapped.</strong> 100% is the baseline; a reading above 100%
            is not clamped into a 0&ndash;100 health score.
        </Notice>
    );
}
