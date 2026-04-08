# Feature Requests Admin Management — Design Spec

**Date:** 2026-04-09
**Status:** Approved

---

## Overview

Add a Feature Requests management tab to the Admin Dashboard (`/admin`), allowing the admin to create, edit, delete, and update the status of feature requests submitted by users.

---

## Navigation

A tab row is added between the header and the main content area of `AdminPage`. Two tabs:

- **Dashboard** — existing analytics content
- **Feature Requests** — new management view

Tabs are styled as pill/button toggles using the existing monospace dark aesthetic. The active tab uses a yellow (`#FFD528`) accent underline or background tint. The existing Refresh button in the header remains; its behaviour scopes to the active tab (refreshes stats on Dashboard tab, refreshes requests on Feature Requests tab).

---

## Feature Requests Tab

### Layout

**Header row:**
- Left: section label "Feature Requests" in existing `SectionTitle` style
- Right: `+ New` pill button (same style as existing Refresh button)

**List:**
Each request renders as a row inside a `bg-[#2a2a2c]` rounded card. Rows are separated by a subtle border. Each row shows:

| Element | Detail |
|---|---|
| Title | Bold, white, `font-mono` |
| Description | Truncated single line, `text-white/50` |
| Tags | Small inline badges |
| Vote count | Icon + number, dimmed |
| Status | Inline `<select>` dropdown, colour-coded |
| Edit button | Icon button — expands inline edit form below the row |
| Delete button | Icon button — shows inline "Are you sure? [Confirm] [Cancel]" before deleting |

### Inline Create Form

Clicking `+ New` inserts a form card at the top of the list with:
- Title input (required)
- Description textarea
- Tags multi-select (using existing `FEATURE_TAGS` list from SupportPage)
- Status dropdown (defaults to `requested`)
- Save / Cancel buttons

### Inline Edit Expand

Clicking Edit on a row expands a pre-filled form beneath that row (same fields as create). Save updates in place via Supabase. Cancel collapses without changes. Only one row can be expanded at a time.

---

## Statuses

The `submitted` value in the `status` column is renamed to `requested`. Final status set:

| DB value | Display label | Colour |
|---|---|---|
| `requested` | Requested | `#FFD528` (yellow) |
| `planned` | Planned | `#60a5fa` (blue) |
| `in_progress` | In Progress | `#f97316` (orange) |
| `completed` | Completed | `#4ade80` (green) |

---

## Data Layer

- All reads/writes use the existing `supabase` client directly (no new edge function needed)
- Admin auth gate already enforced at the top of `AdminPage` (`user.email !== ADMIN_EMAIL` → redirect)
- Row-level security: admin writes are permitted via the existing service role / RLS setup

### DB Migration Required

1. Update the `status` check constraint on `feature_requests` to replace `submitted` with `requested`
2. `UPDATE feature_requests SET status = 'requested' WHERE status = 'submitted'`

### SupportPage Update

- The `FeatureRequest` type's `status` union: replace `'submitted'` with `'requested'`
- Any UI labels in SupportPage showing "submitted" updated to "Requested"

---

## Files Changed

| File | Change |
|---|---|
| `src/pages/AdminPage.tsx` | Add tab row; add Feature Requests tab component |
| `src/pages/SupportPage.tsx` | Update `status` type and display label for `requested` |
| `supabase/migrations/YYYYMMDD_rename_submitted_to_requested.sql` | DB migration |

---

## Out of Scope

- Notifications to users when their request status changes
- Public-facing status display (users still see the SupportPage view unchanged, just with updated label)
- Pagination (request count is low enough for a single list)
