# QuickBooks Developer App Questionnaire — Answers

**Date completed:** 2026-04-06
**App:** Crew Dock — QuickBooks Online integration

---

## Authorization and Authentication

| # | Question | Answer |
|---|---|---|
| 2 | How often does your app refresh access tokens? | Only when access tokens expire |
| 3 | Does your app retry authorization and authentication requests that have failed? | No |
| 4 | If your app encounters an auth error, do you ask customers to reconnect? | Yes |
| 5 | Did you use the Intuit discovery document to get the latest OAuth 2.0 endpoints? | No — endpoints are hardcoded |

**Q6 — Can your app handle the following scenarios?**

| Scenario | Answer |
|---|---|
| a. Errors due to expired access tokens | Yes — inline refresh before each export |
| b. Errors due to expired refresh tokens | Yes — 401 on refresh → reconnect prompt |
| c. Invalid grant errors | Yes — 401 → QBOAuthError → reconnect prompt |
| d. CSRF errors | Yes — state param with encoded userId validates every callback |

| 7 | Does your app rely on the OAuth playground or other offline tools to get tokens? | No |

---

## API Usage

| # | Question | Answer |
|---|---|---|
| 1 | Which broad API categories does your app use? | Accounting API only |
| 2 | How often does your app call the APIs per customer? | Weekly / Monthly |

---

## Accounting API

| # | Question | Answer |
|---|---|---|
| 1 | Which QBO versions is your app designed for? | Simple Start, Essentials, Plus, Advanced (all) |
| 2 | Can your app handle users gaining/losing version-specific features? | Yes |
| 3 | Special features used (multicurrency, sales tax)? | None of the above |
| 4 | Do you use webhooks? | No |
| 5 | Do you use the CDC operation? | No |

---

## Error Handling

| # | Question | Answer |
|---|---|---|
| 1 | Tested for API errors including syntax and validation errors? | Yes |
| 2 | Does your app capture the `intuit_tid` field from response headers? | No |
| 3 | Does your app store error information in logs for troubleshooting? | Yes — console.error on all failures, captured in Vercel logs |
| 4 | Do you provide a way for customers to contact you for support from within the app? | No |

---

## Security

| # | Question | Answer |
|---|---|---|
| 1 | Has your company ever had a security breach requiring customer/government notification? | No |
| 2 | Do you have a security team that regularly assesses vulnerabilities? | No |
| 3 | Are client ID and secret stored securely (not hardcoded or in browser logs)? | Yes — stored in Vercel env vars only |
| 4 | Does your app use multi-factor authentication? | No |
| 5 | Does your app use Captcha for authentication? | No |
| 6 | Does your app use WebSocket? | No |
| 7 | Is Intuit data shared with anyone other than that customer? | No — isolated by user_id with Supabase RLS |

---

## Permissions

- **Scope selected:** `com.intuit.quickbooks.accounting` only
- `com.intuit.quickbooks.payment` not selected — not needed
