# Calendar Integration Design

**Date:** 2026-04-24
**Status:** Approved

## Overview

Two-phase approach to syncing Crew Dock's calendar with external calendar apps (Google Calendar, Apple Calendar, Outlook). Phase 1 ships an iCal feed for one-way export. Phase 2 adds full two-way Google Calendar sync.

Both phases are **Pro only**.

---

## Phase 1: iCal Feed (implement now)

### What it does

A per-user `.ics` endpoint that exposes project days as calendar events. Users copy a URL and subscribe in any calendar app via "Add by URL".

### UI

A share/export icon button in the dashboard calendar header bar (after the month nav buttons, separated by a divider). Clicking it opens a Radix popover with two states:

- **Not yet generated:** Brief explanation + "Generate Feed URL" button
- **URL active:** Read-only URL field with Copy button, help text explaining the 24-hour delay, and a "Regenerate URL" link

Mockup: `docs/calendar-feed-mockup.html`

### Endpoint

`GET /api/calendar/feed/:token`

- Looks up `token` in `calendar_feed_tokens` to find the `user_id`
- Queries `project_days` joined with `projects` for that user
- Groups consecutive days from the same project into single multi-day VEVENTs
- Returns `Content-Type: text/calendar`

### VEVENT fields

- `SUMMARY`: project name + role (e.g. "The Grand Budapest Hotel -- 1st AC")
- `DTSTART` / `DTEND`: all-day event(s) matching work dates
- `DESCRIPTION`: daily rate, project status
- `UID`: stable ID derived from project_day ID (so calendar apps detect updates vs duplicates)

### Data model

One new table:

```sql
CREATE TABLE calendar_feed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  token uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- RLS: only the user can read/write their own token
ALTER TABLE calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own feed token"
  ON calendar_feed_tokens FOR ALL
  USING (auth.uid() = user_id);
```

Regenerating = delete existing row + insert new one. Old URL stops working immediately.

### Limitations

- One-way only: Crew Dock --> calendar app
- Google Calendar polls iCal feeds roughly every 12-24 hours, so updates are not instant
- No OAuth or Google API scopes required

---

## Phase 2: Full Two-Way Google Calendar Sync (future)

### Sync behaviour

- Near-instant both directions using Google push notifications (webhooks) and immediate push from Crew Dock
- **Crew Dock --> GCal:** Pushes project name, dates, and optionally location as calendar events
- **GCal --> Crew Dock:** Imports dates + title only; user fills in role/rate inside Crew Dock
- **Conflicts:** Flagged to the user for manual resolution -- never silent overwrites
- User can choose an existing calendar or have Crew Dock create a dedicated "Crew Dock" calendar
- Pro only

### Infrastructure required

- **Separate OAuth consent flow** requesting `calendar.events` scope (not tied to Supabase login). Follows the same pattern as bookkeeping connectors (FreeAgent, Xero, QuickBooks).
- **Serverless API routes** for Google OAuth token management and Calendar event CRUD
- **Public webhook endpoint** to receive Google push notifications for near-instant GCal --> Crew Dock sync
- **Webhook channel renewal** logic (Google channels expire, need periodic re-subscription)
- **CASA security audit** before production launch: $500-4,500/year, conducted by authorized labs. During development, up to 100 test users can use the integration without the audit.

### Additional data model

```sql
-- Maps GCal events to Crew Dock project days
calendar_sync_mappings (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  gcal_event_id text NOT NULL,
  project_day_id uuid REFERENCES project_days(id),
  gcal_calendar_id text NOT NULL,
  last_synced_at timestamptz,
  UNIQUE(user_id, gcal_event_id)
)

-- Conflicts awaiting user resolution
calendar_sync_conflicts (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  mapping_id uuid REFERENCES calendar_sync_mappings(id),
  gcal_version jsonb NOT NULL,
  crewdock_version jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
)
```

### Google Calendar API

- Free to use (no per-request charges), ~1M requests/day quota
- Restricted scopes require CASA audit for production (beyond 100 test users)
- Annual re-verification required

### Cost summary

| Item | Cost | Frequency |
|------|------|-----------|
| Google Calendar API usage | Free | -- |
| CASA security audit | $500-4,500 | Annual |
| Brand verification | Free | One-time |
