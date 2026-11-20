const TAG = /<(\/?)(svg|path|circle|line|rect|polyline|polygon|ellipse)\b([^>]*)>/gu;
const CLASS_ATTR = /(?:^|\s)class="([^"]*)"/u;

/** Lucide's own classes: "lucide", then the icon name and its aliases (a run of "lucide-*"). */
function lucideIcon(attrs: string): { icon: string; callerClasses: string[] } | undefined {
    const names = CLASS_ATTR.exec(attrs)?.[1]?.split(/\s+/u).filter(Boolean) ?? [];
    if (names[0] !== "lucide") return undefined;
    let end = 1;
    while (end < names.length && names[end].startsWith("lucide-")) end++;
    if (end === 1) return undefined;
    return { icon: names[1].slice("lucide-".length), callerClasses: names.slice(end) };
}

/**
 * Pins which lucide icon is drawn, at any nesting depth, not its path data: a lucide bump
 * redraws paths and may rename aliases. Each lucide svg becomes `<svg data-lucide="<icon>"
 * class="<caller classes>">` and loses its own shape children; nested svgs and every
 * non-lucide svg stay as they are. Only lucide's own classes are removed.
 */
export function normalizeLucideSvgs(html: string): string {
    const open: boolean[] = [];
    let out = "";
    let last = 0;
    for (const m of html.matchAll(TAG)) {
        const [tag, slash, name, attrs] = m;
        const inLucide = open.length > 0 && open[open.length - 1];
        let replacement = tag;
        if (name === "svg") {
            if (slash) {
                open.pop();
            } else {
                const found = lucideIcon(attrs);
                if (!attrs.endsWith("/")) open.push(found !== undefined);
                if (found) {
                    const cls =
                        found.callerClasses.length > 0
                            ? ` class="${found.callerClasses.join(" ")}"`
                            : "";
                    replacement = `<svg data-lucide="${found.icon}"${cls}>`;
                }
            }
        } else if (inLucide) {
            replacement = "";
        }
        out += html.slice(last, m.index) + replacement;
        last = m.index + tag.length;
    }
    return out + html.slice(last);
}
