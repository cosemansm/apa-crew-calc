# Dashboard Bookkeeping Section — Design Spec

Date: 2026-04-07

## Overview

Add a Bookkeeping section to the Dashboard page, placed below the "Recent Jobs" section. It shows the user's bookkeeping connection status at a glance and lets them connect or manage their integration without leaving the dashboard.

## Behaviour

### Not connected
Show a card with three platform rows: FreeAgent, Xero, QuickBooks.

Each row contains:
- Platform logo (SVG from `src/assets/integrations/`)
- Platform name and short description
- "Connect" button on the right

Button behaviour:
- **Pro users:** navigate to `/settings#bookkeeping`
- **Free users:** navigate to `/#pricing`

### Connected (any one platform)
Once a platform is connected, the card collapses to show only that platform:
- Platform logo, name
- Green "Connected" badge
- Quiet "Manage" button → `/settings#bookkeeping`

Only one platform can be active at a time (first connected one wins). The other two rows are hidden entirely.

### Loading
While the connection checks are in flight, show a neutral "Checking…" badge in place of the Connect button so the card doesn't flash or shift layout.

## Component

A new `BookkeepingSection` component (`src/components/BookkeepingSection.tsx`) is self-contained:
- Accepts `userId: string` and `isPremium: boolean` as props
- Internally calls `isFreeAgentConnected`, `isXeroConnected`, `isQBOConnected`
- Renders nothing until all three checks resolve (avoids layout shift)

Placed in `DashboardPage.tsx` immediately after the closing `</div>` of the "Recent Jobs" section.

## Styling

Match existing dashboard card patterns exactly:
- `Card` + `CardContent` wrapper (shadcn)
- Section heading: `text-lg font-semibold` with `BookOpen` icon, same style as "Recent Jobs" heading
- Platform rows: `flex items-center justify-between`, `border-b border-border`, last child no border
- Logo: `h-10 w-10 rounded-lg border border-border bg-muted/30` (matches Settings page)
- Connect / Manage button: `variant="outline" size="sm"`
- Connected badge: `bg-green-100 text-green-700 border-green-200` (matches Settings page)
- No dark backgrounds — light theme only

## Out of scope

- Disconnecting from the dashboard (Manage → Settings handles that)
- Showing multiple connected platforms simultaneously (edge case — not possible in practice)
- Any invoice export action from the dashboard
