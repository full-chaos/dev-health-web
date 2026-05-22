# Full Chaos Dev Health Web: UX Improvement Plan

> **Status**: Archived — plan created 2026-02-01, no phases marked as completed. Retained as historical context for UX direction.
> **Last reviewed**: 2026-03-09
> **Created**: 2026-02-01
> **Author**: Frontend Design Review
> **Scope**: User flow improvements, navigation restructure, filter UX, onboarding

---

## Executive Summary

This plan addresses critical user experience gaps in the dev-health-web application. The current implementation is functionally complete but suffers from navigation cognitive overload, poor filter discoverability, a missing onboarding flow, and a disconnected evidence-to-insight loop.

**Key outcomes:**

- Reduce time-to-insight for new users by 60%
- Improve filter usage rates through persistent visibility
- Create coherent navigation hierarchy based on user intent
- Establish evidence continuity through slide-over panels

---

## Current State Analysis

### Architecture Overview

- **Framework**: Next.js 14+ with App Router
- **Styling**: Tailwind CSS with CSS custom properties (5 color palettes)
- **Pages**: 35+ routes across core views, admin, and auth
- **Components**: 74+ components organized by feature domain

### Identified Issues

| Issue                         | Severity | Location                  |
| ----------------------------- | -------- | ------------------------- |
| No onboarding flow            | High     | `/auth/signin` → `/`      |
| Navigation overload (9 items) | High     | `PrimaryNav.tsx`          |
| Filter bar hidden by default  | High     | `FilterBar.tsx`           |
| Evidence links break context  | Medium   | Home page → `/explore`    |
| Role selector underutilized   | Medium   | `RoleSelectorWrapper.tsx` |
| Mobile sidebar pushes content | Medium   | `PrimaryNav.tsx`          |

---

## Implementation Phases

### Phase 1: Filter Bar Redesign

**Priority**: P0
**Effort**: 3-5 days
**Files affected**:

- `src/components/filters/FilterBar.tsx`
- `src/app/globals.css`

#### Current Behavior

- Filter bar collapses to a small "Filters ▾" chip at top of viewport
- When expanded, takes significant space with 6+ dropdowns
- Users often miss it entirely

#### Target Behavior

- Always-visible horizontal bar below page header
- Compact pill-based design with active filters shown
- Preset date buttons (7d, 14d, 30d, 90d) instead of date picker by default
- Context-aware: only show relevant filters per view

#### Implementation Steps

1. **Remove collapse behavior**

   ```tsx
   // FilterBar.tsx - Remove isCollapsed state and conditional rendering
   // Always render the expanded state
   ```

2. **Create pill-based filter component**

   ```tsx
   // New component: src/components/filters/FilterPill.tsx
   type FilterPillProps = {
     label: string;
     value: string;
     onClear: () => void;
     onClick: () => void;
   };
   ```

3. **Add date preset buttons**

   ```tsx
   // Add quick select buttons: 7d | 14d | 30d | 90d | Custom
   const DATE_PRESETS = [
     { label: "7d", days: 7 },
     { label: "14d", days: 14 },
     { label: "30d", days: 30 },
     { label: "90d", days: 90 },
   ];
   ```

4. **Move FilterBar into page headers**
   - Currently: Fixed position at top of viewport
   - Target: Inline within each page's header section
   - Update: `page.tsx`, `work/page.tsx`, `metrics/page.tsx`, etc.

5. **Reduce dropdown complexity**
   - Use combobox with search for long lists (repos, developers)
   - Show "X selected" badge instead of listing all values
   - Add "Clear all" button when filters are active

#### Acceptance Criteria

- [ ] Filter bar visible without user action on all main pages
- [ ] Active filters shown as removable pills
- [ ] Date range selectable via preset buttons or custom picker
- [ ] Dropdown menus support search for >10 items
- [ ] Mobile: Filters accessible via modal triggered by FAB

---

### Phase 2: Navigation Restructure

**Priority**: P0
**Effort**: 2-3 days
**Files affected**:

- `src/components/navigation/PrimaryNav.tsx`
- `src/app/` (route organization)

#### Current Structure (9 items)

```
Home | People | Metrics | Landscape | Work | Capacity | Code | Quality | Opportunities
```

#### Target Structure (Grouped by Intent)

```
COCKPIT (Home)
  └─ Status overview, key shifts, limiting factors

OBSERVE
  ├─ Metrics (DORA, Flow, Quality, Throughput tabs)
  ├─ People (Individual contributors)
  └─ Landscape (Quadrant analysis)

INVESTIGATE
  ├─ Work (Investment, Capacity, Flow tabs)
  ├─ Code (Ownership, Churn)
  └─ Opportunities (Focus threads)

ADMIN (existing)
```

#### Implementation Steps

1. **Update PrimaryNav.tsx**

   ```tsx
   const navGroups = [
     {
       id: "cockpit",
       label: "Cockpit",
       items: [{ id: "home", label: "Home", href: "/", description: "Overview" }],
     },
     {
       id: "observe",
       label: "Observe",
       items: [
         { id: "metrics", label: "Metrics", href: "/metrics?tab=dora", description: "Trends" },
         { id: "people", label: "People", href: "/people", description: "Individual" },
         {
           id: "landscape",
           label: "Landscape",
           href: "/explore/landscape",
           description: "Quadrants",
         },
       ],
     },
     {
       id: "investigate",
       label: "Investigate",
       items: [
         { id: "work", label: "Work", href: "/work", description: "Investment" },
         { id: "code", label: "Code", href: "/code", description: "Ownership" },
         {
           id: "opportunities",
           label: "Opportunities",
           href: "/opportunities",
           description: "Threads",
         },
       ],
     },
   ];
   ```

2. **Add collapsible group headers**
   - Groups start expanded
   - Clicking group label toggles collapse
   - Store collapsed state in localStorage

3. **Remove redundant items**
   - `Capacity` → Move to tab within `/work?tab=capacity`
   - `Quality` → Move to tab within `/metrics?tab=quality`
   - Keep route aliases for backward compatibility

4. **Update route structure** (optional, for clean URLs)
   ```
   /observe/metrics
   /observe/people
   /observe/landscape
   /investigate/work
   /investigate/code
   /investigate/opportunities
   ```
   Note: If changing routes, add redirects from old paths.

#### Acceptance Criteria

- [ ] Navigation grouped into Cockpit, Observe, Investigate sections
- [ ] Group headers are collapsible with state persisted
- [ ] Reduced from 9 to 6 visible nav items (plus groups)
- [ ] Backward-compatible redirects if routes change
- [ ] Mobile: Bottom navigation with 5 key items

---

### Phase 3: Onboarding Flow

**Priority**: P1
**Effort**: 2-3 days
**Files affected**:

- `src/components/onboarding/` (new directory)
- `src/app/page.tsx`
- `src/lib/onboarding.ts` (new)

#### Components to Create

1. **WelcomeModal** (`src/components/onboarding/WelcomeModal.tsx`)
   - Shown on first sign-in (check localStorage flag)
   - Asks: "What's your role?" with IC/EM/PM/Leadership options
   - Sets role preference and persists to user profile if authenticated

2. **GuidedTour** (`src/components/onboarding/GuidedTour.tsx`)
   - Step-by-step tooltip tour of Cockpit
   - Highlights: Key Shifts, Monitoring Views, Limiting Factor, Investigation Threads
   - Uses library: `driver.js` or custom implementation
   - Skip button always visible

3. **EmptyStateEducation** (`src/components/onboarding/EmptyStateEducation.tsx`)
   - When no data exists, show sample data with "This is what you'll see" overlay
   - Include CTA: "Connect GitHub to see real metrics"

4. **DataIngestionProgress** (`src/components/onboarding/DataIngestionProgress.tsx`)
   - Progress indicator during initial data sync
   - States: "Connecting..." → "Syncing commits..." → "Analyzing PRs..." → "Ready!"

#### Implementation Steps

1. **Create onboarding state management**

   ```tsx
   // src/lib/onboarding.ts
   type OnboardingState = {
     hasSeenWelcome: boolean;
     hasCompletedTour: boolean;
     selectedRole: string | null;
   };

   export function getOnboardingState(): OnboardingState;
   export function updateOnboardingState(updates: Partial<OnboardingState>): void;
   export function resetOnboarding(): void;
   ```

2. **Add WelcomeModal trigger to layout**

   ```tsx
   // src/app/layout.tsx
   // After session check, render <WelcomeModal /> if !hasSeenWelcome
   ```

3. **Integrate GuidedTour on Cockpit**

   ```tsx
   // src/app/page.tsx
   // After data loads, check if !hasCompletedTour, render <GuidedTour />
   ```

4. **Create empty state components**
   - Wrap each data section with empty state fallback
   - Use same visual structure but with placeholder/sample data
   - Add explanatory text and connection CTAs

#### Acceptance Criteria

- [ ] New users see role selection modal on first sign-in
- [ ] Guided tour highlights 4-5 key cockpit sections
- [ ] Empty states show sample data with explanatory overlay
- [ ] Data ingestion shows progress indicator
- [ ] Tour can be skipped at any point
- [ ] Tour can be restarted from user menu

---

### Phase 4: Evidence Slide-Over Panels

**Priority**: P1
**Effort**: 3-4 days
**Files affected**:

- `src/components/evidence/` (new directory)
- `src/app/page.tsx`
- `src/components/home/` (various)

#### Current Behavior

- Clicking "Notable Shifts" or "Investigation Threads" navigates to `/explore`
- User loses context and mental model
- Explore pages often show raw data tables

#### Target Behavior

- Clicking evidence links opens a slide-over panel from the right
- Panel shows contextual explanation + specific evidence + suggested actions
- User can drill deeper from panel or close to return
- Full page navigation available via "Open in Explore" button

#### Components to Create

1. **EvidencePanel** (`src/components/evidence/EvidencePanel.tsx`)

   ```tsx
   type EvidencePanelProps = {
     isOpen: boolean;
     onClose: () => void;
     title: string;
     metric?: string;
     evidenceLink?: string;
     children?: React.ReactNode;
   };
   ```

2. **EvidenceContext** (`src/components/evidence/EvidenceContext.tsx`)
   - Displays "Why this matters" explanation based on metric type
   - Shows trend direction and magnitude

3. **EvidenceItems** (`src/components/evidence/EvidenceItems.tsx`)
   - Lists specific PRs, issues, or contributors
   - Compact card format with key details
   - Links to detail pages

4. **SuggestedActions** (`src/components/evidence/SuggestedActions.tsx`)
   - Displays experiment suggestions from API
   - Actionable recommendations

#### Implementation Steps

1. **Create EvidencePanel component**
   - Slide-in from right (width: 480px desktop, full-width mobile)
   - Header with title, close button, "Open in Explore" link
   - Scrollable content area
   - Overlay behind panel to dim main content

2. **Add panel state to Cockpit**

   ```tsx
   // src/app/page.tsx (convert to client component or use state management)
   const [evidencePanel, setEvidencePanel] = useState<{
     isOpen: boolean;
     metric?: string;
     evidenceLink?: string;
   }>({ isOpen: false });
   ```

3. **Update evidence links to open panel**
   - Replace `<Link>` with `<button onClick={() => openPanel(...)}>` for inline evidence
   - Keep `<Link>` for cases where full page is appropriate

4. **Fetch evidence data in panel**
   - Use existing `getExplainData` API
   - Show loading skeleton while fetching
   - Handle error states gracefully

#### Acceptance Criteria

- [ ] Clicking Notable Shifts opens slide-over panel (not new page)
- [ ] Panel shows context, evidence items, and suggested actions
- [ ] "Open in Explore" button available for full-page view
- [ ] Panel closes on escape key or overlay click
- [ ] Panel works on mobile (full-width)
- [ ] Back button on mobile returns to cockpit (not browser back)

---

### Phase 5: Visual Identity Refresh

**Priority**: P2
**Effort**: 5-7 days
**Files affected**:

- `src/app/globals.css`
- `src/app/layout.tsx`
- All component files (styling updates)

#### Proposed Aesthetic Direction: "Mission Control"

**Inspiration**: NASA flight control + Bloomberg Terminal + modern data observability tools

**Key Characteristics**:

- Dark-first design with high-contrast accents
- Monospace typography for metrics, geometric sans for UI
- Dense information layout with clear hierarchy
- Subtle grid/graph paper texture in backgrounds
- Pulse animations on live data

#### Color Palette (New)

```css
:root[data-palette="mission-control"][data-theme="dark"] {
  --background: #0a0e14;
  --foreground: #e6e6e6;
  --ink-muted: #8b949e;

  /* Status colors */
  --accent: #58a6ff; /* Primary action */
  --accent-2: #3fb950; /* Success/positive */
  --accent-3: #d29922; /* Warning/amber */
  --accent-negative: #f85149; /* Error/negative */

  /* Surface colors */
  --card: #161b22;
  --card-stroke: #30363d;

  /* Chart colors - high contrast for data viz */
  --chart-color-1: #58a6ff;
  --chart-color-2: #3fb950;
  --chart-color-3: #d29922;
  --chart-color-4: #f85149;
  --chart-color-5: #a371f7;
  --chart-color-6: #39d353;
  --chart-color-7: #db6d28;
  --chart-color-8: #8b949e;
}
```

#### Typography

```css
/* Add to layout.tsx font imports */
--font-display: "JetBrains Mono", monospace; /* Headers, metrics */
--font-body: "IBM Plex Sans", sans-serif; /* Body text */
--font-mono: "JetBrains Mono", monospace; /* Code, data */
```

#### Implementation Steps

1. **Add new palette to globals.css**
   - Create `mission-control` palette alongside existing ones
   - Make it the default for new users

2. **Update font imports in layout.tsx**
   - Add Google Fonts or self-hosted fonts
   - Update CSS variable assignments

3. **Add background texture**

   ```css
   .bg-grid {
     background-image:
       linear-gradient(rgba(88, 166, 255, 0.03) 1px, transparent 1px),
       linear-gradient(90deg, rgba(88, 166, 255, 0.03) 1px, transparent 1px);
     background-size: 20px 20px;
   }
   ```

4. **Update component styling**
   - Cards: Sharper corners (rounded-xl → rounded-lg)
   - Borders: More prominent (border-2 in key areas)
   - Text: Increased contrast ratios
   - Animations: Add pulse to live status indicators

5. **Create status indicator components**
   ```tsx
   // Pulsing dot for live data
   <span className="relative flex h-2 w-2">
     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
     <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
   </span>
   ```

#### Acceptance Criteria

- [ ] New "Mission Control" palette available
- [ ] Monospace font used for metrics and data values
- [ ] Subtle grid texture visible in backgrounds
- [ ] Status indicators have pulse animation
- [ ] Light mode variant available (for accessibility)
- [ ] Existing palettes still work (no breaking changes)

---

### Phase 6: Mobile Optimization

**Priority**: P2
**Effort**: 3-4 days
**Files affected**:

- `src/components/navigation/MobileNav.tsx` (new)
- `src/components/filters/MobileFilterModal.tsx` (new)
- Various page layouts

#### Implementation Steps

1. **Create bottom navigation for mobile**

   ```tsx
   // src/components/navigation/MobileNav.tsx
   const mobileNavItems = [
     { id: "home", icon: HomeIcon, label: "Cockpit", href: "/" },
     { id: "metrics", icon: ChartIcon, label: "Metrics", href: "/metrics" },
     { id: "work", icon: BriefcaseIcon, label: "Work", href: "/work" },
     { id: "people", icon: UsersIcon, label: "People", href: "/people" },
     { id: "more", icon: MenuIcon, label: "More", onClick: openDrawer },
   ];
   ```

2. **Create mobile filter modal**
   - Full-screen modal triggered by floating action button
   - Stacked filter sections (not horizontal)
   - Large touch targets for all controls

3. **Add responsive breakpoints to layouts**
   - Hide sidebar on mobile (`md:block hidden`)
   - Show bottom nav on mobile (`md:hidden block`)
   - Adjust card grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`

4. **Optimize charts for mobile**
   - Reduce data point density
   - Use horizontal scroll for wide charts
   - Add pinch-to-zoom for complex visualizations

#### Acceptance Criteria

- [ ] Bottom navigation visible on screens < 768px
- [ ] Sidebar hidden on mobile
- [ ] Filters accessible via floating button → modal
- [ ] All touch targets ≥ 44px
- [ ] Charts readable on 375px width screens

---

## Technical Notes

### State Management Considerations

- Onboarding state: localStorage for anonymous, user profile for authenticated
- Filter state: URL params (already implemented)
- Evidence panel state: React state (component-level)
- Navigation collapse state: localStorage

### Performance Considerations

- Evidence panel: Lazy load content, show skeleton
- Onboarding: Defer tour library loading until needed
- Charts on mobile: Reduce data resolution

### Accessibility Requirements

- All modals must trap focus
- Escape key closes modals/panels
- Color contrast ≥ 4.5:1 for text
- Reduced motion preference respected for animations

### Testing Requirements

- E2E tests for onboarding flow
- Visual regression tests for new palette
- Mobile viewport tests (375px, 414px, 768px)
- Filter bar functionality tests

---

## Dependencies

| Phase          | Depends On | External Libraries  |
| -------------- | ---------- | ------------------- |
| 1 (Filters)    | None       | None                |
| 2 (Navigation) | None       | None                |
| 3 (Onboarding) | None       | Optional: driver.js |
| 4 (Evidence)   | None       | None                |
| 5 (Visual)     | None       | Google Fonts        |
| 6 (Mobile)     | Phase 1, 2 | None                |

---

## Success Metrics

| Metric                                 | Current         | Target            | Measurement  |
| -------------------------------------- | --------------- | ----------------- | ------------ |
| Time to first insight (new user)       | Unknown         | < 60 seconds      | User testing |
| Filter usage rate                      | Low (estimated) | > 50% of sessions | Analytics    |
| Navigation clicks to reach destination | 2-3             | 1-2               | Analytics    |
| Mobile bounce rate                     | Unknown         | < 40%             | Analytics    |
| Onboarding completion rate             | N/A             | > 70%             | Analytics    |

---

## Appendix: File Inventory

### Files to Create

```
src/components/filters/FilterPill.tsx
src/components/navigation/MobileNav.tsx
src/components/filters/MobileFilterModal.tsx
src/components/onboarding/WelcomeModal.tsx
src/components/onboarding/GuidedTour.tsx
src/components/onboarding/EmptyStateEducation.tsx
src/components/onboarding/DataIngestionProgress.tsx
src/components/evidence/EvidencePanel.tsx
src/components/evidence/EvidenceContext.tsx
src/components/evidence/EvidenceItems.tsx
src/components/evidence/SuggestedActions.tsx
src/lib/onboarding.ts
```

### Files to Modify

```
src/components/filters/FilterBar.tsx
src/components/navigation/PrimaryNav.tsx
src/app/globals.css
src/app/layout.tsx
src/app/page.tsx
src/app/work/page.tsx
src/app/metrics/page.tsx
src/app/people/page.tsx
(+ all other page.tsx files for filter bar integration)
```

---

## Changelog

| Date       | Author                 | Change               |
| ---------- | ---------------------- | -------------------- |
| 2026-02-01 | Frontend Design Review | Initial plan created |
