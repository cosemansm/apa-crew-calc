# Security Overview — Crew Dock

This document describes the security model of the Crew Dock application. It covers authentication, data access, API protection, third-party integrations, infrastructure hardening, and known gaps.

---

## Authentication

Users authenticate via Supabase Auth using one of two methods:

- **Email/password** — standard Supabase auth flow
- **Google OAuth** — delegated sign-in via Google

On first sign-in, a user record is created in `user_settings` and a corresponding row is inserted into `subscriptions` via a Postgres trigger (`handle_new_user_subscription`). Sessions are managed client-side via the Supabase JS client; the session token is a signed JWT issued by Supabase.

The client-side code uses the **anon key** (`VITE_SUPABASE_ANON_KEY`), which is intentionally public. It grants no elevated access — all data access is gated by Row-Level Security policies on the database. The **service role key** (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS and is used only in server-side API routes and Edge Functions, never exposed to the browser.

---

## Row-Level Security (RLS)

All primary data tables have RLS enabled. Every authenticated request from the client automatically passes the user's JWT, and Postgres evaluates the relevant policies before returning or modifying data.

| Table | Policy | Rule |
|---|---|---|
| `projects` | Users manage own | `auth.uid() = user_id` |
| `project_days` | Users manage own | `project_id` owned by `auth.uid()` |
| `calculations` | Users manage own | `auth.uid() = user_id` (separate SELECT/INSERT/UPDATE/DELETE policies) |
| `favourite_roles` | Users manage own | `auth.uid() = user_id` |
| `project_expenses` | Users manage own | `auth.uid() = user_id` |
| `subscriptions` | Read own | SELECT only; mutations via service role |
| `bookkeeping_connections` | Users manage own | `auth.uid() = user_id` |
| `feature_requests` | Admin only (write) | `auth.email() = 'milo.cosemans@gmail.com'` |
| `release_notifications` | Public read, admin write | SELECT for all authenticated; INSERT/UPDATE/DELETE admin only |
| `storage: notification-images` | Public read, admin write | Public SELECT; write requires admin email |

The effect is that even if a request reaches the database with a valid JWT, it can only read or write data belonging to that user. There is no application-level code required to enforce this — the database enforces it unconditionally.

---

## Admin Access

The admin dashboard at `/admin` is restricted to a single personal account (`milo.cosemans@gmail.com`). This is enforced at three independent layers:

### Layer 1 — Frontend (UX only)
- The admin route immediately redirects non-admins on render (`AdminPage.tsx`)
- The admin navigation link is hidden for non-admin users (`AppLayout.tsx`)
- This layer is the weakest and is bypassed by disabling JavaScript or manipulating the DOM. It exists purely as UX.

### Layer 2 — Edge Functions (server-enforced)
All four admin Edge Functions (`admin-stats`, `admin-users`, `grant-lifetime`, `revoke-lifetime`) validate the caller's JWT before executing:

```
1. Extract Bearer token from Authorization header
2. Call supabase.auth.getUser(token) — verifies the token with Supabase
3. Check callerUser.email === 'milo.cosemans@gmail.com'
4. Return 403 Forbidden if check fails
```

This layer cannot be bypassed from the browser. Even with a valid JWT for another user, the function returns a 403.

### Layer 3 — Database RLS (deepest)
Postgres RLS policies on `feature_requests`, `release_notifications`, and the `notification-images` storage bucket use `auth.email() = 'milo.cosemans@gmail.com'` to block any write from a non-admin JWT at the database level. This layer is independent of both the frontend and the Edge Functions.

---

## API Routes

Server-side API routes (Vercel Functions under `/api`) handle operations that require elevated privileges or secrets. Key security properties:

- **Stripe webhook** — uses `stripe.webhooks.constructEvent()` to verify the HMAC signature of every incoming webhook. Requests with an invalid signature are rejected before any processing.
- **OAuth callbacks** — all three bookkeeping providers (Xero, QuickBooks, FreeAgent) use a `state` parameter (base64url-encoded JSON containing the `user_id`) to prevent CSRF attacks. The state is validated on callback before tokens are exchanged.
- **Xero** additionally uses **PKCE (S256)** — a 32-byte random code verifier is generated, hashed, and sent in the authorization request. The verifier is included in the token exchange, preventing code interception attacks.
- **UUID validation** — user-supplied `userId` parameters are validated against a UUID regex before use.
- **Stripe operations** — `priceId`, `userId`, and `userEmail` are validated as present before any Stripe API call.
- **Delete account** — requires an authenticated session and validates `userId` before cascading deletion across all user tables.

---

## Third-Party OAuth Token Storage

Tokens for Xero, QuickBooks, and FreeAgent are stored in the `bookkeeping_connections` table. This table is:

- Protected by RLS (`auth.uid() = user_id`) so users can only read their own tokens
- Written only by server-side API routes using the service role key (never the browser)
- Kept up to date via refresh token rotation — the access token and refresh token are replaced on every refresh cycle

Token refresh happens server-side before each API call. Expired tokens are refreshed transparently. The client never handles raw OAuth tokens.

---

## Infrastructure & Transport Security

- **HTTPS** — enforced by Vercel on all traffic to `app.crewdock.app`. TLS is automatic.
- **Security headers** set in `vercel.json`:
  - `X-Content-Type-Options: nosniff` — prevents MIME sniffing
  - `X-Frame-Options: DENY` — prevents clickjacking via iframes
  - `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leakage
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()` — disables browser APIs not needed by the app
- **Asset caching** — static assets use a 1-year immutable cache (`Cache-Control: public, max-age=31536000, immutable`) with content-hashed filenames, so stale assets cannot be served.

---

## XSS & Injection Prevention

- **XSS** — the frontend is built with React/TypeScript. JSX escapes all dynamic content by default. No `dangerouslySetInnerHTML` is used anywhere in the codebase.
- **SQL injection** — all Supabase client queries use the typed query builder with parameterized values (e.g., `.eq('user_id', userId)`). No raw SQL is constructed from user input in primary data paths.
- **JSON responses** — all API responses are serialized via `JSON.stringify`, which escapes special characters automatically.

---

## Secret Management

| Secret | Location | Exposure |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Never sent to browser |
| `STRIPE_SECRET_KEY` | Server only | Never sent to browser |
| `STRIPE_WEBHOOK_SECRET` | Server only | Never sent to browser |
| `RESEND_API_KEY` | Server only | Never sent to browser |
| `FREEAGENT_CLIENT_SECRET` | Server only | Never sent to browser |
| `XERO_CLIENT_SECRET` | Server only | Never sent to browser |
| `QBO_CLIENT_SECRET` | Server only | Never sent to browser |
| `ANTHROPIC_API_KEY` | Server only | Never sent to browser |
| `VITE_SUPABASE_ANON_KEY` | Client-side | Intentionally public; access controlled by RLS |
| `VITE_SUPABASE_URL` | Client-side | Intentionally public |
| `VITE_STRIPE_PRICE_*` | Client-side | Price IDs are not secrets |

`.env` and `.env*.local` files are listed in `.gitignore` and are never committed to the repository.

---

## Known Gaps

These are known limitations that are acceptable given the current scale and context of the app, but worth being aware of:

- **No rate limiting** — API routes and Edge Functions have no per-IP or per-user rate limiting. Supabase Auth has built-in brute-force protection on login, but custom API routes do not.
- **CORS is open (`*`)** on Edge Functions — this means any origin can call admin endpoints from a browser. The email check in the function still enforces authorization, but stricter CORS would be cleaner.
- **No Content Security Policy (CSP)** header — adding one would further reduce XSS surface area.
- **No HSTS header** — Vercel enforces HTTPS, but an explicit `Strict-Transport-Security` header would pin this at the browser level.
- **Admin email is hardcoded** in source code across multiple files rather than an environment variable. Acceptable for a single-admin personal app; would need revisiting if admin access ever needed to be delegated.
- **No audit log** for admin operations — grant/revoke lifetime, feature request edits, etc. are not logged beyond Supabase's built-in database logs.
