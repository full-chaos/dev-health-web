import {
    Children,
    cloneElement,
    isValidElement,
    Suspense,
    type ReactElement,
    type ReactNode,
} from "react";

const isAsync = (type: unknown): type is (props: unknown) => Promise<ReactNode> =>
    typeof type === "function" && type.constructor.name === "AsyncFunction";

/**
 * Settles every async server component of a tree (each one inside a Suspense boundary or not) so a
 * client render can draw it. jsdom cannot render an async component: the real server awaits it.
 */
export async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
    if (Array.isArray(node)) return Promise.all(node.map(resolveServerTree));
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<{ children?: ReactNode } & Record<string, unknown>>;
    if (isAsync(element.type)) {
        return resolveServerTree(await element.type(element.props));
    }
    const props = element.props;
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
        if (key === "children") continue;
        // An element in a prop (`actions={<Suspense>...}`) is a slot of the tree.
        if (isValidElement(value)) resolved[key] = await resolveServerTree(value);
    }
    const children =
        props.children === undefined
            ? undefined
            : await Promise.all(Children.toArray(props.children).map(resolveServerTree));
    if (element.type === Suspense) return <>{children}</>;
    return cloneElement(element, resolved, ...(children ?? []));
}
