type MdNode = { type: string; children?: MdNode[] };
type Construct = { name?: string };
type SyntaxExtension = { text?: Record<string, Construct | Construct[]> };

// The micromark constructs of remark-gfm's literal autolinks.
export const AUTOLINK_CONSTRUCTS = new Set(["wwwAutolink", "protocolAutolink", "emailAutolink"]);

/**
 * A report holds no link by contract: its text comes from the report plan (scope, titles, labels, notes), and a URL,
 * www host or e-mail address in it is a value to read, never a target. Put it after remark-gfm.
 *
 * The literal autolink of micromark reads the raw source, up to the next space or `]`, so it swallows the backslash of
 * an escape that sits at its end (`https://x/?a=\*y\*` ends before `*`, which then opens emphasis). So the plugin
 * takes the literal autolink tokenizers out of the parser: every escape then decodes as CommonMark says. What is left
 * is the autolink that remark-gfm builds from the decoded text, and an authored link: the transformer replaces each
 * link with its own text.
 */
export function removeAutolinkConstructs(extensions: SyntaxExtension[]): string[] {
    const removed: string[] = [];
    for (const extension of extensions) {
        for (const [code, hook] of Object.entries(extension.text ?? {})) {
            const all = Array.isArray(hook) ? hook : [hook];
            const kept = all.filter((c) => !AUTOLINK_CONSTRUCTS.has(c.name ?? ""));
            removed.push(...all.filter((c) => !kept.includes(c)).map((c) => c.name ?? ""));
            if (kept.length > 0) extension.text![code] = kept;
            else delete extension.text![code];
        }
    }
    return removed;
}

export function remarkReportText(this: { data: () => unknown }) {
    const { micromarkExtensions } = this.data() as { micromarkExtensions?: SyntaxExtension[] };
    removeAutolinkConstructs(micromarkExtensions ?? []);
    return (tree: MdNode) => {
        const visit = (parent: MdNode) => {
            if (!parent.children) return;
            parent.children = parent.children.flatMap((child) => {
                visit(child);
                return child.type === "link" || child.type === "linkReference"
                    ? (child.children ?? [])
                    : [child];
            });
        };
        visit(tree);
    };
}
