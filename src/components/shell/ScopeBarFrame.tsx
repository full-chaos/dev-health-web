"use client";

import {
    Fragment,
    type ReactNode,
    type RefObject,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import { Copy } from "lucide-react";

import { formatSelection, toggleValue } from "@/components/filters/filterBarUtils";
import { QuickFilterMenu } from "@/components/filters/sections/QuickFilterMenu";
import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

import { useShellOrganization } from "./ShellContext";
import { useCopyLink } from "./useCopyLink";

export const SCOPE_BAR_ORG_FALLBACK = "Organization";
export const SCOPE_BAR_LABEL_CLASS = "text-label-caps font-semibold uppercase text-(--text-muted)";

/** The prototype's scope-item divider: a 1px vertical rule after each scope control. */
const SEPARATOR = <span aria-hidden="true" className="h-5 w-px self-center bg-(--border)" />;

/** The URL in a read-only field, focused with its text selected, ready to copy. */
function CopyFallbackField({ url }: { url: string }) {
    const fieldRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fieldRef.current?.focus();
        fieldRef.current?.select();
    }, [url]);

    return (
        <input
            id="scope-bar-copy-url"
            ref={fieldRef}
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded-(--radius-sm) border border-(--border) bg-(--surface-raised) px-3 py-1.5 text-xs text-(--text-primary)"
        />
    );
}

type ScopeBarCardProps = {
    barRef?: RefObject<HTMLElement | null>;
    /** Value of `data-view`. */
    view: string;
    /** The card rises over the top bar and the sidebar (an open drawer). */
    raised?: boolean;
    organization: {
        label: string;
        pressed: boolean;
        onSelect: () => void;
        disabled?: boolean;
    };
    /** The scope controls after the organization, each after a separator. */
    controls: ReactNode[];
    /** More items of the row, before the actions (no separator). */
    rowExtras?: ReactNode;
    /** Actions before `Reset filters` and `Copy link`. */
    actions?: ReactNode;
    onReset: () => void;
    /** Page-control rows, in the card below the scope row. */
    children?: ReactNode;
    /** Content below the rows (active filters, the filter drawer). */
    footer?: ReactNode;
};

/**
 * The card of the scope bar: one labelled region, the scope row (organization,
 * the scope controls, `Reset filters`, `Copy link`), then the page-control rows.
 * It has no URL state: the caller owns the state and gives the controls.
 *
 * `ScopeBarClient` (the metric filter in `f`) and `ScopeBarFrame` (a page with
 * its own filter) both render through it, so there is one markup.
 */
export function ScopeBarCard({
    barRef,
    view,
    raised = false,
    organization,
    controls,
    rowExtras,
    actions,
    onReset,
    children,
    footer,
}: ScopeBarCardProps) {
    const { copyLink, dismissFallback, fallbackUrl } = useCopyLink();

    return (
        <section
            ref={barRef}
            aria-label="Scope"
            data-testid="scope-bar"
            data-view={view}
            // No backdrop-filter here: it would make this bar the containing block
            // of the fixed drawer, which is a DOM child so that the outside-click
            // handler treats its menus as inside the bar.
            // z-20 keeps the bar's menus under the sticky top bar (z-30). An open
            // drawer must be over the top bar and the sidebar, so the bar rises.
            className={`relative rounded-(--radius-md) border border-(--border) bg-(--surface) px-4 py-3 text-xs ${
                raised ? "z-50" : "z-20"
            }`}
        >
            <div
                data-testid="scope-bar-row"
                className="flex flex-wrap items-center gap-x-4 gap-y-2"
            >
                <div className="flex items-center gap-2">
                    <span className={SCOPE_BAR_LABEL_CLASS}>Org</span>
                    <button
                        type="button"
                        onClick={organization.onSelect}
                        aria-pressed={organization.pressed}
                        disabled={organization.disabled}
                        className={`rounded-(--radius-sm) px-1.5 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) ${
                            organization.pressed
                                ? "font-medium text-(--text-primary)"
                                : "text-(--text-secondary) hover:text-(--text-primary)"
                        }`}
                    >
                        {organization.label}
                    </button>
                </div>

                {controls.map((control, index) => (
                    <Fragment key={index}>
                        {SEPARATOR}
                        {control}
                    </Fragment>
                ))}

                {rowExtras}

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {actions}
                    {/* Prototype `scopebar()`: Reset is ghost small, Copy link small with the copy icon. */}
                    <Button variant="ghost" size="sm" onClick={onReset}>
                        {CTA_LABELS.reset}
                    </Button>
                    <Button variant="secondary" size="sm" icon={<Copy />} onClick={copyLink}>
                        {CTA_LABELS.copyLink}
                    </Button>
                </div>
            </div>

            {fallbackUrl ? (
                <div
                    data-testid="scope-bar-copy-fallback"
                    className="mt-3 flex flex-wrap items-center gap-2 border-t border-(--border) pt-3"
                >
                    <label htmlFor="scope-bar-copy-url" className="text-xs text-(--text-secondary)">
                        The link could not be copied. Copy it from this field:
                    </label>
                    <CopyFallbackField url={fallbackUrl} />
                    <Button variant="ghost" size="sm" onClick={dismissFallback}>
                        {CTA_LABELS.close}
                    </Button>
                </div>
            ) : null}

            {children ? (
                <div
                    data-testid="scope-bar-rows"
                    className="mt-3 flex flex-col gap-3 border-t border-(--border) pt-3"
                >
                    {children}
                </div>
            ) : null}

            {footer}
        </section>
    );
}

export type ScopeBarRepoOption = {
    /** The value the page's filter keeps. */
    id: string;
    /** The name the menu shows. */
    label: string;
};

export type ScopeBarFrameProps = {
    /** Organization name. Defaults to the shell's active organization. */
    orgName?: string;
    /**
     * The repository control. The caller gives the options: the frame does not
     * load them, because a page's own filter can use other ids than the metric
     * filter does (the Security filter keeps repository UUIDs, the metric filter
     * keeps `owner/name`).
     */
    repos?: {
        options: ScopeBarRepoOption[];
        selected: string[];
        onChange: (ids: string[]) => void;
        /** The repository is fixed by the route: the controls are disabled. */
        locked?: boolean;
    };
    onReset: () => void;
    /** Value of `data-view`. */
    view?: string;
    /** Page-control rows, in the card below the scope row. */
    children?: ReactNode;
};

/**
 * A scope bar for a page that owns its filter state (Security): organization
 * and repository only, `Reset filters`, `Copy link`, and the page's own control
 * rows in the same card.
 *
 * It does not read or write the URL. The owner of the page's filter gives the
 * selection and gets the changes, so the page keeps one writer of `f`. It has
 * no team, no window and no filter drawer.
 *
 * The organization is selected when no repository is selected; a click on it
 * clears the repositories.
 */
export function ScopeBarFrame({
    orgName,
    repos,
    onReset,
    view = "frame",
    children,
}: ScopeBarFrameProps) {
    const organization = useShellOrganization();
    const barRef = useRef<HTMLElement | null>(null);
    const [openMenu, setOpenMenu] = useState<string | null>(null);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            if (!openMenu) {
                return;
            }
            const target = event.target;
            if (barRef.current && target instanceof Node && !barRef.current.contains(target)) {
                setOpenMenu(null);
            }
        };

        window.addEventListener("mousedown", handleClick);
        return () => {
            window.removeEventListener("mousedown", handleClick);
        };
    }, [openMenu]);

    const options = repos?.options;
    const selected = repos?.selected;
    // The menu works with the text it shows. A name that two options share gets
    // its id, and a selected id with no option is shown as the id.
    const names = useMemo(() => {
        const list = options ?? [];
        const count = new Map<string, number>();
        for (const option of list) {
            count.set(option.label, (count.get(option.label) ?? 0) + 1);
        }
        const nameById = new Map<string, string>();
        const idByName = new Map<string, string>();
        for (const option of list) {
            const name =
                (count.get(option.label) ?? 0) > 1
                    ? `${option.label} (${option.id})`
                    : option.label;
            nameById.set(option.id, name);
            idByName.set(name, option.id);
        }
        const selectedNames = (selected ?? []).map((id) => nameById.get(id) ?? id);
        return {
            all: [...idByName.keys()],
            selected: selectedNames,
            toIds: (values: string[]) => values.map((value) => idByName.get(value) ?? value),
        };
    }, [options, selected]);

    const locked = repos?.locked ?? false;
    const noRepository = (selected ?? []).length === 0;

    return (
        <ScopeBarCard
            barRef={barRef}
            view={view}
            organization={{
                label: orgName ?? organization?.name ?? SCOPE_BAR_ORG_FALLBACK,
                pressed: noRepository,
                onSelect: () => {
                    if (repos && !noRepository) {
                        repos.onChange([]);
                    }
                },
                disabled: locked || undefined,
            }}
            controls={
                repos
                    ? [
                          <QuickFilterMenu
                              key="repo"
                              active={names.selected}
                              disabled={locked || undefined}
                              emptyLabel="All"
                              items={names.all}
                              label="Repo"
                              menuKey="repo"
                              onChange={(next) => repos.onChange(names.toIds(next))}
                              openMenu={openMenu}
                              setOpenMenu={setOpenMenu}
                              toggleValue={toggleValue}
                              value={formatSelection(names.selected, "All")}
                          />,
                      ]
                    : []
            }
            onReset={onReset}
        >
            {children}
        </ScopeBarCard>
    );
}
