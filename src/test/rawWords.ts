/**
 * The words a pattern names that a reader can meet in a node (CHAOS-12312): its whole text, each of
 * its text nodes on its own, and the `aria-label`, `title` and `alt` of each element.
 *
 * An element's `textContent` glues its children ("degradedwindow"), and a word boundary never
 * matches inside the glue, so a guard that read `textContent` alone let a planted state word
 * through (CHAOS-12283). The whole text is still read, for a phrase the pattern names.
 *
 * `rawWordsInNode` is self-contained (DOM globals only), so Playwright can run it in the page as
 * it is: `locator.evaluate(rawWordsInNode, [pattern.source, pattern.flags])`. One implementation
 * serves the unit tests and the e2e specs.
 */
export function rawWordsInNode(node: Node, [source, flags]: readonly [string, string]): string[] {
    const found: string[] = [];
    const check = (text: string | null | undefined) => {
        if (text === null || text === undefined) return;
        const match = new RegExp(source, flags.replace("g", "")).exec(text);
        if (match !== null) found.push(match[0]);
    };
    check(node.textContent);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (
        let current: Node | null = walker.currentNode;
        current !== null;
        current = walker.nextNode()
    ) {
        if (current.nodeType === Node.TEXT_NODE) check(current.textContent);
        else if (current instanceof Element) {
            for (const name of ["aria-label", "title", "alt"]) check(current.getAttribute(name));
        }
    }
    return found;
}

/** `rawWordsInNode` with a pattern: the unit tests' form. */
export function rawWordsIn(node: Node, pattern: RegExp): string[] {
    return rawWordsInNode(node, [pattern.source, pattern.flags]);
}
