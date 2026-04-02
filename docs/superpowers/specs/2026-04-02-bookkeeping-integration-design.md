# Bookkeeping Integration Design
**Crew Dock · FreeAgent (phase 1) · Xero + QuickBooks (future phases)**
_Spec date: 2026-04-02_

---

## Overview

Add bookkeeping export to Crew Dock so Pro users can push draft invoices directly from the Invoice page into FreeAgent, Xero, or QuickBooks. Build FreeAgent first (simplest OAuth, most popular among UK freelancers), then Xero, then QuickBooks. All three share the same Supabase table, service pattern, and UI structure.

---

## Scope (Phase 1: FreeAgent)

- Supabase schema additions (shared across all three)
- Vercel OAuth routes for FreeAgent
- Frontend service for FreeAgent
- Settings: Connected Accounts section + VAT toggle
- Invoice page: rotating bookkeeping CTA + "Send to FreeAgent" button

---

## 1. Supabase Schema

### New table: `bookkeeping_connections`

Shared across all three integrations. Created once.

```sql
CREATE TABLE IF NOT EXISTS bookkeeping_connections (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('xero', 'quickbooks', 'freeagent')),
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  tenant_id     TEXT,        -- Xero: selected organisation tenantId
  realm_id      TEXT,        -- QuickBooks: company realmId
  qbo_item_id   TEXT,        -- QuickBooks: Film Crew Services item ID (created on first connect)
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, platform)
);

ALTER TABLE bookkeeping_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own connections"
  ON bookkeeping_connections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Additions to existing tables

```sql
-- VAT registration flag (used in all bookkeeping exports)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN DEFAULT false;

-- Optional job reference on projects (flows through to all exports)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS job_reference TEXT;
```

---

## 2. OAuth Architecture

### User identity in the callback

All three platforms use the same pattern: encode the Supabase `userId` in the OAuth `state` parameter alongside a CSRF nonce.

**Start route:** reads `?userId=<uid>` from the query string (passed by the frontend before redirecting). Generates a 16-byte hex nonce. Combines as `state = <nonce>:<userId>`. Stores nonce in a short-lived HttpOnly cookie.

**Callback route:** splits `state` on `:` → validates nonce against cookie → extracts `userId` directly. No JWT cookie juggling needed.

### FreeAgent OAuth specifics

| Item | Value |
|---|---|
| Auth method | HTTP Basic Auth (Client ID : Client Secret) |
| Grant type | `authorization_code` — no PKCE required |
| Access token lifetime | 1 hour |
| Refresh token | Long-lived; rotates on every use — always store the new one |
| Sandbox base URL | `https://api.sandbox.freeagent.com/v2` |
| Production base URL | `https://api.freeagent.com/v2` |

### Vercel API routes (FreeAgent)

```
/api/auth/freeagent/start.ts      — generates state, redirects to FreeAgent
/api/auth/freeagent/callback.ts   — exchanges code, stores tokens in Supabase
/api/auth/freeagent/refresh.ts    — exchanges refresh token, updates Supabase
```

**Disconnect:** handled client-side — simple Supabase delete on `bookkeeping_connections` where `user_id = uid AND platform = 'freeagent'`. No server route needed.

### Environment variables (server-side only, never exposed to frontend)

```
FREEAGENT_CLIENT_ID=
FREEAGENT_CLIENT_SECRET=
FREEAGENT_REDIRECT_URI=https://crewdock.app/api/auth/freeagent/callback
```

Dev app uses `http://localhost:3000/api/auth/freeagent/callback` and `api.sandbox.freeagent.com`.

---

## 3. Frontend Service

**Location:** `src/services/bookkeeping/freeagent.ts`

### ExportPayload shape

```typescript
interface ExportPayload {
  clientName: string;
  projectName: string;
  jobReference: string | null;   // optional — from projects.job_reference
  invoiceNumber: string;          // Crew Dock's reference number (goes in invoice.reference)
  days: InvoiceDay[];
  vatRegistered: boolean;
}
```

### Token management

- `getValidToken(userId)` — reads from `bookkeeping_connections`, checks `expires_at - 60s`, calls `/api/auth/freeagent/refresh` if expired
- Refresh tokens rotate — the refresh route stores the new token in Supabase and returns the new access token

### Invoice creation flow

1. `findOrCreateContact` — list all contacts, case-insensitive match on `organisation_name`. If not found, POST to `/contacts` and read URL from `Location` header.
2. `createInvoice` — POST to `/invoices` with the field mapping below. Currency is always GBP. Due date is 30 days from today. Invoice status is draft.

### Field mapping

| Crew Dock field | FreeAgent field | Notes |
|---|---|---|
| `invoiceNumber` | `invoice.reference` | Crew Dock ref — FreeAgent auto-assigns its own number |
| `projectName` + `jobReference` | `invoice.comments` | `"Pepsi Shoot \| JB-2025-042"` or just `"Pepsi Shoot"` if no ref |
| `clientName` | `contact.organisation_name` | Looked up or created |
| `role_name + day_type` | `invoice_item.description` | e.g. `"Camera Operator — Basic Day \| 2026-03-15 \| Call: 07:00 Wrap: 19:00"` |
| `grand_total` per day | `invoice_item.price` | GBP |
| `vatRegistered` | `sales_tax_rate` | `"20.0"` or `"0.0"` |

Invoice is created as a **draft** — user reviews and sends from FreeAgent.

---

## 4. Cross-Platform Field Mapping Reference

For future Xero and QuickBooks builds, the agreed field mapping is:

### Invoice numbering
Let each platform manage its own sequence. Crew Dock invoice number goes in a reference/note field.

| Platform | Crew Dock invoice # | Platform auto-number |
|---|---|---|
| FreeAgent | `invoice.reference` | FreeAgent assigns its own |
| Xero | omit `InvoiceNumber` | Xero auto-increments |
| QuickBooks | omit `DocNumber` | QBO auto-increments |

### Job reference
| Platform | `job_reference` | `project.name` |
|---|---|---|
| FreeAgent | `comments` (combined with project name) | `comments` |
| Xero | `Reference` (dedicated field, appears on invoice) | line item descriptions |
| QuickBooks | `CustomerMemo` (visible on invoice) | `PrivateNote` (internal) |

---

## 5. UI — Rotating Bookkeeping CTA

**Component:** `src/components/BookkeepingCTA.tsx`

A shared component used on InvoicePage when no bookkeeping app is connected.

### Rotation logic
- Reads `bookkeeping_cta_index` from `localStorage` (default `0`)
- On mount, picks the current index, increments and saves for next visit
- Cycles: `0 = FreeAgent` → `1 = Xero` → `2 = QuickBooks` → `0`

### States

| User state | CTA behaviour |
|---|---|
| Free tier | "Connect [FreeAgent] to export invoices directly" → click → upgrade to Pro page/modal |
| Pro, no connection | Same text → click → navigate to `/settings#bookkeeping` |
| Pro, ≥1 platform connected | CTA hidden; export button(s) shown instead |

The component name label rotates (FreeAgent / Xero / QuickBooks) so all three are discoverable over time.

---

## 6. UI — Settings Page

New **Connected Accounts** section in `SettingsPage.tsx`:

- FreeAgent: Connect button → `/api/auth/freeagent/start?userId=<uid>`. Connected state shows green badge + Disconnect button.
- Detects `?connected=freeagent` on return from OAuth and updates state immediately.
- Xero and QuickBooks rows added in their respective build phases (rows can be visible but disabled until built, or hidden until built — hidden is cleaner).

**VAT toggle** (new, same section or nearby):
- Switch: "I am VAT registered (adds 20% to exported invoices)"
- Saves to `user_settings.vat_registered` on change.

---

## 7. UI — Invoice Page Export Button

When FreeAgent is connected (Pro user):

- "Send to FreeAgent" button appears alongside existing Print/PDF button
- Disabled when `selectedDays.length === 0`
- On click: calls `exportToFreeAgent(userId, payload)` from the service
- Loading state: button text changes to "Sending…"
- On success: inline link "View draft invoice in FreeAgent →" appears below the button (opens new tab)
- On error: inline error message below button (not `alert()`)

---

## 8. Pro Gating

Bookkeeping integrations are Pro-only. Free users:
- See the rotating `BookkeepingCTA` (which names a specific platform)
- Clicking it leads to the upgrade flow
- The actual "Send to FreeAgent" button is never rendered for free users

---

## 9. Testing Checklist (FreeAgent)

- [ ] Register dev app at dev.freeagent.com pointing to `http://localhost:3000/api/auth/freeagent/callback`
- [ ] Set env vars for dev (sandbox) and production (live) apps separately
- [ ] Complete OAuth flow — verify tokens + `expires_at` stored in `bookkeeping_connections`
- [ ] Export single-day invoice — verify draft appears in FreeAgent sandbox
- [ ] Export multi-day invoice — verify all line items present with correct descriptions
- [ ] Verify `invoice.reference` contains Crew Dock invoice number
- [ ] Verify `invoice.comments` contains project name + job reference (when set)
- [ ] Test with VAT on and off — verify `sales_tax_rate` is `"20.0"` vs `"0.0"`
- [ ] Wait 1 hour (or manually expire `expires_at`) — verify refresh token flow works
- [ ] Test disconnect in Settings — verify row deleted from `bookkeeping_connections`
- [ ] Test reconnect — verify new tokens stored correctly
- [ ] Test rotating CTA: clear `localStorage`, visit InvoicePage 3 times — should cycle FreeAgent → Xero → QuickBooks
- [ ] Test Pro gate: downgrade test account, verify CTA leads to upgrade flow not Settings

---

## Future Phases (not in scope now)

- **Xero**: PKCE OAuth, multi-tenant org picker, `Reference` field for job ref, Xero Demo Company for testing
- **QuickBooks**: Standard OAuth, `realmId` capture, Film Crew Services item setup on first connect, `CustomerMemo` for job ref
