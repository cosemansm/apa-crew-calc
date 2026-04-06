# Share Job Feature — Design Spec
**Date:** 2026-04-06

## Overview

A gaffer (chief lighting technician) can share their project's schedule with crew members via a link. Recipients must create a CrewDock account, select their own role and rate, and can then add the job to their own account with the schedule pre-filled.

## Use Case

A gaffer creates their own individual project calculation. They want to share the bookable hours — call times, wrap times, day types, penalties, and optionally mileage and equipment — with their team. Each crew member has a different role and rate but worked the same schedule.

---

## Data Model

### New table: `shared_jobs`

```sql
create table if not exists public.shared_jobs (
  id         uuid primary key default gen_random_uuid(),
  token      uuid unique not null default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  owner_id   uuid references auth.users(id) on delete cascade not null,
  include_expenses  boolean not null default false,
  include_equipment boolean not null default false,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.shared_jobs enable row level security;

create policy "Owners can manage their shared jobs"
  on public.shared_jobs for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create index if not exists idx_shared_jobs_token on public.shared_jobs(token);
create index if not exists idx_shared_jobs_project_id on public.shared_jobs(project_id);
```

No changes to existing tables. The "Shared" badge on the Projects page is derived at runtime by querying `shared_jobs` for active tokens.

### New table: `shared_job_imports`

Tracks which users have already imported a given share token, enabling the "Already in your jobs" state.

```sql
create table if not exists public.shared_job_imports (
  id              uuid primary key default gen_random_uuid(),
  token           uuid not null,
  recipient_id    uuid references auth.users(id) on delete cascade not null,
  created_project_id uuid references projects(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique(token, recipient_id)
);

alter table public.shared_job_imports enable row level security;

create policy "Users can manage their own imports"
  on public.shared_job_imports for all
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);
```

---

## Sharer Flow

On the **Projects page**, each job card gets:
- A **Share** button alongside existing actions (Copy, Delete)
- A **"Shared" badge** next to the job name when an active share token exists

Clicking Share opens a **dialog** containing:
- Toggle: "Include mileage expenses" (pre-fills recipient's mileage with gaffer's values — same postcode, same M25 distance)
- Toggle: "Include equipment hire" (pre-fills recipient's equipment value)
- A copyable share link (`https://app.crewdock.app/share/<token>`)
- A "Stop sharing" button that sets `is_active = false` and removes the badge

If a share already exists for the project, opening the dialog shows the existing link and current toggle state rather than creating a duplicate row.

---

## Recipient Flow

**URL:** `/share/<token>` — public route, no auth required to land on it.

### Unauthenticated
- Show a preview of the job (project name, day count, date range) with a blurred/locked overlay
- CTA: "Create a free CrewDock account to view this job and add it to your schedule"
- Save token to `sessionStorage` before redirecting to `/login` so after auth the user is returned to `/share/<token>`

### Authenticated
- Full read-only view showing:
  - Project name, dates, day types, call/wrap times
  - Penalties (always)
  - Mileage expenses (only if `include_expenses = true`)
  - Equipment hire (only if `include_equipment = true`)
  - Grand total is **hidden** — recipient calculates their own
- **"Add to my jobs" button** opens a prompt asking:
  - Role (APA roles dropdown)
  - Agreed daily rate (number input)
  - Mileage in miles (pre-filled from shared value, editable) — shown only if `include_expenses = true`
  - Equipment value and discount % (pre-filled from shared values, editable) — shown only if `include_equipment = true`
- On confirm: a new project is created in the recipient's account with all days pre-filled (dates, call/wrap times, day types, penalties, mileage/equipment using the values from the prompt)
- A row is inserted into `shared_job_imports` (token + recipient_id + new project_id) to track the import
- Navigate to Projects page with toast: "Job added to your schedule"

### Edge Cases
| Scenario | Behaviour |
|---|---|
| Token not found | "This link is no longer active" |
| `is_active = false` | "This link is no longer active" |
| Project deleted | Cascade deletes token → "no longer active" |
| Recipient is the owner | "This is your own shared job" — no Add button |
| Already added (same token + user) | "Add to my jobs" → "Already in your jobs" (disabled) |

---

## Architecture

### New route
`/share/:token` — added to `App.tsx` **outside** `ProtectedRoute` so unauthenticated users can land on it.

### New API endpoint
`api/share/[token].ts` — Vercel serverless function. Uses Supabase service role key to bypass RLS and fetch project data. Returns only permitted fields — no owner identity, no private account data. Service role key stays server-side only.

### New components/pages
- `src/pages/SharePage.tsx` — recipient landing page
- Share dialog — inline component within `ProjectsPage.tsx`

---

## What is always shared
- Day types (including travel days)
- Call and wrap times
- Penalties

## What is optionally shared (toggles)
- Mileage (miles outside M25) — pre-filled, editable by recipient
- Equipment hire value and discount — pre-filled, editable by recipient

## What is never shared
- Grand total
- Owner identity
- Agreed rate (recipient sets their own)
- Role (recipient sets their own)
