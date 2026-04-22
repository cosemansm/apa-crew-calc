# Onboarding Analytics & Bookkeeping Popup Design Spec

## Overview

Two features that use onboarding data (`calculator_tool`, `bookkeeping_software` from `user_settings`):

1. **Admin panel analytics** -- Aggregated breakdown charts showing which calculator methods and bookkeeping software users selected during onboarding. Added to the existing dashboard tab.
2. **Bookkeeping connection popup** -- Weekly dashboard popup nudging trial/free users to connect their bookkeeping software (or upgrade to Pro if expired).

## Feature 1: Admin Onboarding Insights

### Location

New "Onboarding Insights" section on the admin dashboard tab, placed below the existing "Feature Adoption" section. Uses the same dark card + yellow accent styling.

### Layout

Two side-by-side horizontal bar chart cards:

**Left card: "Previous Calculator Method"**
- Horizontal bars for each `calculator_tool` value, sorted by count descending
- Yellow (#FFD528) bar fill, white/40 count labels
- Footer: total responses count

**Right card: "Bookkeeping Software"**
- Horizontal bars for each `bookkeeping_software` value, sorted by count descending
- Green (#4ade80) bar fill for named software, grey (#6b7280) for "I don't use one"
- Footer: total responses count

**Below charts: 3 summary stat cards in a row**
- **Onboarded** (yellow accent): count of users with `onboarding_completed = true` who were created after the onboarding feature launch
- **Skipped**: count of users with `onboarding_completed = true` but both `calculator_tool` AND `bookkeeping_software` are null (completed wizard but skipped all data steps)
- **Completion Rate** (green): percentage of post-launch users who answered at least one onboarding question

### Data Source

The `admin-stats` edge function already aggregates data from `user_settings`. Add a new `onboarding` key to the `AdminStats` response:

```typescript
onboarding: {
  calculatorTools: { tool: string; count: number }[];
  bookkeepingSoftware: { software: string; count: number }[];
  totalOnboarded: number;
  totalSkipped: number;
  completionRate: number;
}
```

The edge function queries `user_settings` with `GROUP BY` on `calculator_tool` and `bookkeeping_software`, filtering to users created after the onboarding launch date. Null values are excluded from the bar charts but counted toward "Skipped."

### Styling

Matches existing admin dashboard patterns exactly:
- `#2a2a2c` card background, `border-white/5` border, `rounded-2xl`
- Monospace labels, `text-white/40` for secondary text
- Yellow bars for calculator, green bars for bookkeeping
- `SectionTitle` component for the section header

## Feature 2: Bookkeeping Connection Popup

### Trigger Conditions

The popup shows on the dashboard when ALL of these are true:
- User has a `bookkeeping_software` value that is NOT null and NOT "I don't use one"
- User has NO row in `bookkeeping_connections` table for their `user_id` (checked via `supabase.from('bookkeeping_connections').select('id').eq('user_id', userId).maybeSingle()`)
- User is on trial OR free/expired plan (not Pro, not lifetime)
- At least 7 days have passed since the last dismissal (or never dismissed)
- User is not being impersonated

### Popup Variants

**Trial user (active trial):**
- Bookkeeping software logo/icon at top (colored square with initial, e.g., blue "X" for Xero)
- Title: "Try linking your {software} account"
- Subtitle: "Auto-sync your invoices and expenses. Takes about 2 minutes to set up."
- Primary CTA: "Connect {software}" (yellow button) -- navigates to `/settings/bookkeeping`
- Secondary: "Not now" (text button) -- dismisses for 7 days

**Expired trial / free user:**
- Star icon on charcoal background at top
- Title: "Upgrade to Pro"
- Subtitle: "Unlock {software} integration, unlimited projects, and more."
- Feature checklist (green checkmarks): "Auto-sync {software} invoices", "Unlimited projects", "PDF timesheets & exports"
- Primary CTA: "Upgrade to Pro" (yellow button) -- navigates to `/settings/subscription`
- Secondary: "Not now" (text button) -- dismisses for 7 days

### Dismiss Behaviour

- "Not now" or X button saves `bookkeeping_popup_dismissed_at` timestamp to `user_settings`
- Popup reappears after 7 days
- Popup stops permanently when:
  - User connects a bookkeeping integration (row exists in `bookkeeping_connections` for their user_id)
  - User upgrades to Pro or lifetime plan

### Visual Design

- Centered modal overlay (not full-screen backdrop -- light semi-transparent overlay)
- White card, 20px border-radius, 24px padding, max-width 360px
- Close X button in top-right (28x28, #F0EDE8 background, rounded-8)
- Card shadow: `0 8px 32px rgba(0,0,0,0.08)`
- JetBrains Mono for headings/buttons, system font for body text
- Yellow CTA button: #FFD528, rounded-12, JetBrains Mono 13px weight 600

### Software Logo Mapping

Simple colored squares with the first letter, matching brand colors:
- Xero: #13B5EA (blue)
- FreeAgent: #3AA660 (green)
- QuickBooks: #2CA01C (green)
- Sage: #00D639 (green)
- Wave: #003DA5 (blue)
- Other: #8A8A8A (grey)

### Data Model Changes

Add to `user_settings`:
- `bookkeeping_popup_dismissed_at` (timestamptz, nullable) -- last dismissal time

Migration:
```sql
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS bookkeeping_popup_dismissed_at timestamptz;
```

No backfill needed -- null means never dismissed.

### Component Structure

**`BookkeepingPopup`** -- standalone component rendered in `DashboardPage`
- Reads `bookkeeping_software` from user settings (already loaded on dashboard)
- Reads subscription state from `useSubscription()`
- Checks `bookkeeping_popup_dismissed_at` against current time
- Checks bookkeeping connection status
- Renders the appropriate variant or nothing

**`BookkeepingPopupController`** -- logic wrapper (similar to `ReviewPopupController`)
- Handles dismiss action (writes timestamp to `user_settings`)
- Handles CTA navigation
- Suppressed during impersonation

## Routing

No new routes. The popup renders within the existing dashboard. Admin analytics render within the existing admin dashboard tab.

## Testing

- Onboarding analytics: unit test for aggregation logic (grouping, sorting, completion rate calculation)
- Bookkeeping popup: unit test for trigger conditions (trial vs expired, dismiss timing, bookkeeping connection check, "I don't use one" exclusion)
