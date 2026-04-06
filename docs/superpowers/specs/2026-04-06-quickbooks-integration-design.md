# QuickBooks Integration — Design Spec

**Date:** 2026-04-06
**Goal:** Add a QuickBooks Online (QBO) OAuth integration to Crew Dock so Pro users can push invoices from InvoicePage directly to their QBO company. Mirrors the FreeAgent and Xero integrations exactly except where QBO's API differs.

---

## Key Decisions

1. **No PKCE** — QBO is a confidential client; `code_challenge` is not supported. State param carries `{ userId }` encoded as base64url JSON (same CSRF protection, no cookies).

2. **No draft invoices** — QBO has no draft concept via API. Invoices are created as live "Open" with `EmailStatus: "NotSet"` to suppress auto-send. UI copy: "Create invoice in QuickBooks" (not "draft").

3. **`realmId` captured at callback** — QBO returns it as a query param alongside `code`. This is the only place it's available — must be stored in `realm_id` immediately.

4. **`ItemRef` auto-setup** — Every QBO line item requires an `ItemRef`. On first export, the server looks up "Film Crew Services" in the user's QBO items, creates it if missing, and caches the ID in `qbo_item_id`. Subsequent exports reuse the cached ID with no extra API call.

5. **`Amount` must be explicit** — QBO does not calculate `Amount` from `UnitPrice × Qty`. Every line must set `Amount` explicitly.

6. **Crew Dock reference in `PrivateNote`** — QBO auto-numbers invoices (`DocNumber` not sent). Crew Dock invoice number + job reference go in `PrivateNote`: `"INV-ABC123 | PepsiShoot | JB-2025-042"`.

7. **Sandbox toggle** — `QBO_SANDBOX=true` env var switches the data API base URL between `https://sandbox-quickbooks.api.intuit.com` and `https://quickbooks.api.intuit.com`. OAuth URLs are always the same.

8. **No interference with existing integrations** — Only new files are created for QuickBooks. FreeAgent and Xero files are never modified. Each platform has isolated state in SettingsPage and InvoicePage.

---

## Architecture

### DB Schema (no migration needed)
`bookkeeping_connections` already has:
- `realm_id TEXT` — QBO company ID (captured at callback)
- `qbo_item_id TEXT` — "Film Crew Services" item ID (cached on first export)

### File Map

| Action | File | Notes |
|---|---|---|
| Create | `api/auth/quickbooks/[action].ts` | OAuth start / callback / refresh — single-file router |
| Create | `api/quickbooks/export-invoice.ts` | Server-side token refresh, contact/item lookup, invoice POST |
| Create | `src/services/bookkeeping/quickbooks.ts` | `exportToQBO`, `isQBOConnected`, `disconnectQBO`, `QBOAuthError` |
| Modify | `src/pages/SettingsPage.tsx` | Replace "Coming Soon" QBO row with live connect/disconnect |
| Modify | `src/pages/InvoicePage.tsx` | Add QBO state, loading messages, export button |
| Modify | `src/components/BookkeepingCTA.tsx` | Include QBO in connection check |

---

## OAuth Flow

**Start (`/api/auth/quickbooks/start`):**
- Validate `userId` UUID from query param
- Encode `{ userId }` as base64url JSON in `state`
- Redirect to `https://appcenter.intuit.com/connect/oauth2` with:
  - `scope: com.intuit.quickbooks.accounting`
  - `response_type: code`
  - `state`

**Callback (`/api/auth/quickbooks/callback`):**
- Decode `state` → extract `userId`
- Capture `realmId` from query param (only opportunity)
- Exchange `code` for tokens via HTTP Basic Auth to `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`
- Store `access_token`, `refresh_token`, `expires_at`, `realm_id` in `bookkeeping_connections`
- Redirect to `/settings?connected=quickbooks`

**Error params → human-readable messages in SettingsPage:**
- `qbo_denied` → "Connection cancelled."
- `qbo_token_failed` → "Token exchange failed — try again."
- `qbo_not_configured` → "QuickBooks is not configured on this server."
- `qbo_db_failed` → "Failed to save connection — try again."
- `invalid_state` → "Connection expired — please try connecting again."
- `invalid_callback` → "Invalid callback — please try connecting again."

**Refresh:**
- POST handler, HTTP Basic Auth, stores new `refresh_token` (QBO rotates on every refresh)

---

## Invoice Export

Server-side in `api/quickbooks/export-invoice.ts`:

1. **Token** — fetch from DB, refresh inline if within 60s of expiry
2. **Item setup** — if `qbo_item_id` is null: search for "Film Crew Services" item, create if missing, store ID in DB
3. **Contact** — search customers by `DisplayName LIKE '%{name}%'` (case-insensitive), create with `DisplayName` + `CompanyName` if missing
4. **Invoice POST** to `/v3/company/{realmId}/invoice?minorversion=75`:
   - `EmailStatus: "NotSet"`
   - `PrivateNote: "INV-{num} | {project} | {jobRef}"`
   - Lines use same Basic/Detailed toggle + `isHourly` heuristic as Xero/FreeAgent
   - Every line: `DetailType: "SalesItemLineDetail"`, `ItemRef: { value: qbo_item_id }`, explicit `Amount = UnitPrice × Qty`
   - Equipment and expenses always separate lines
   - VAT: `TaxCodeRef: { value: "TAX" }` when registered, `{ value: "NON" }` when not
5. **Response** — `invoiceUrl: https://app.qbo.intuit.com/app/invoice?txnId={Invoice.Id}`

**`QBOAuthError`** — thrown on any 401 from QBO API. Caught in InvoicePage → `qboConnected` set to false → reconnect prompt shown with link to `/settings#bookkeeping`.

---

## Loading States (InvoicePage)

Messages cycle on a timer while the export request is in flight:

| Time | Message |
|------|---------|
| 0–1.5s | "Connecting to QuickBooks…" |
| 1.5–4s | "Preparing export…" |
| 4s+ | "Creating invoice…" (until request resolves) |

"Preparing export…" covers both first-time item setup and new contact creation without the frontend needing to know which is happening server-side.

---

## SettingsPage Changes

- New state: `qboConnected` (null/bool), `disconnectingQBO` (bool), `qboConnectError` (string|null)
- New ref: `qboConnectedFromUrl` — set on `?connected=quickbooks`, prevents async DB check from overwriting the connected state
- On `?connected=quickbooks`: set `qboConnected(true)` immediately
- Connect button: `window.location.href = /api/auth/quickbooks/start?userId={user.id}`
- Disconnect: DELETE from `bookkeeping_connections` where `platform = 'quickbooks'`
- FreeAgent and Xero state/handlers are not touched

---

## InvoicePage Changes

- New state: `qboConnected` (null/bool), `qboExporting` (bool), `qboLoadingMessage` (string)
- Export handler starts timer cycling through loading messages, fires `exportToQBO(userId, payload)`, opens returned URL in new tab on success
- Basic/Detailed toggle: shared with existing Xero/FreeAgent toggle (same `detailed` state)
- FreeAgent and Xero state/handlers are not touched

---

## Environment Variables

| Variable | Description |
|---|---|
| `QBO_CLIENT_ID` | Intuit app Client ID |
| `QBO_CLIENT_SECRET` | Intuit app Client Secret |
| `QBO_REDIRECT_URI` | `https://app.crewdock.app/api/auth/quickbooks/callback` |
| `QBO_SANDBOX` | `true` for sandbox data API, omit for production |

---

## Testing Checklist

1. OAuth connect end-to-end in production
2. SettingsPage shows Connected immediately after redirect
3. SettingsPage shows error messages for each error param
4. First export: "Film Crew Services" item created, `qbo_item_id` stored
5. Subsequent export: item reused, no extra API call
6. New client: contact created with `DisplayName` + `CompanyName`
7. Existing client: matched case-insensitively, no duplicate created
8. Line items: day rates show `Qty: 1`, hourly items show hours × rate
9. Equipment and expenses always separate lines
10. VAT: 20% when registered, 0% when not
11. Multi-day invoice (multiple days on one invoice)
12. Loading messages cycle correctly; "Preparing export…" visible on new client/first export
13. Token refresh: confirm next export works after access token expires
14. Auth revocation: revoke in QBO, confirm reconnect prompt appears in Crew Dock
15. FreeAgent and Xero integrations still work after QuickBooks is added

---

## Security Notes

- `QBO_CLIENT_SECRET` stored in Vercel env vars only — never in browser
- `state` param encodes `userId` as base64url JSON — CSRF protection without cookies
- `realmId` stored server-side only
- Access tokens never logged (only error bodies)
- Tokens stored in Supabase with AES-256 disk encryption
