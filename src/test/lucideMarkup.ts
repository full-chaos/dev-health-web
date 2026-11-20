const LUCIDE_SVG = /<svg\b([^>]*)\bclass="([^"]*)"([^>]*)>[\s\S]*?<\/svg>/gu;

/** Pins which lucide icon is drawn, not its path data: a lucide bump redraws paths and may rename aliases. */
export function normalizeLucideSvgs(html: string): string {
    return html.replace(LUCIDE_SVG, (whole, _before: string, classes: string) => {
        const names = classes.split(/\s+/u);
        const icon = names.find((c) => c.startsWith("lucide-"));
        if (!names.includes("lucide") || icon === undefined) return whole;
        const rest = names.filter((c) => !c.startsWith("lucide"));
        const cls = rest.length > 0 ? ` class="${rest.join(" ")}"` : "";
        return `<svg data-lucide="${icon.slice("lucide-".length)}"${cls}></svg>`;
    });
}
