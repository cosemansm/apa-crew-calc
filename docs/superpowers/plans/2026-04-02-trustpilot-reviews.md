# Trustpilot Reviews Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Trustpilot Free as the review platform — wiring the app's existing review popup and email to the real Trustpilot URL, adding a light anti-abuse gate, and embedding the TrustBox widget on the crewdock.app landing page.

**Architecture:** The app repo (apa-crew-calc) sends users to Trustpilot and handles the trial extension claim. The landing page repo (crewdock.app) embeds Trustpilot's TrustBox widget independently — both point to the same Trustpilot business profile. No repo linking is required; Trustpilot is the shared source of truth.

**Tech Stack:** React 19 + TypeScript (app repo), Trustpilot Free TrustBox widget (landing page), Vercel Serverless Functions (email), Resend (transactional email)

---

## Pre-flight: Manual Steps (Required Before Any Code)

These must be done by the account owner before any code changes can be completed.

- [ ] **1. Create Trustpilot Free business account**
  - Go to [business.trustpilot.com](https://business.trustpilot.com) → "Get started free"
  - Business name: **Crew Dock**
  - Website: **crewdock.app**
  - Category: Software / SaaS

- [ ] **2. Verify domain ownership**
  - Trustpilot will ask you to add a DNS TXT record or upload a verification file to crewdock.app
  - Complete this step — without it the business profile won't be live

- [ ] **3. Get the review URL**
  - Once verified, your review page will be at: `https://www.trustpilot.com/evaluate/crewdock.app`
  - Confirm this URL resolves before proceeding

- [ ] **4. Get the TrustBox embed code**
  - In the Trustpilot dashboard: **TrustBox** → choose **"Mini"** widget style
  - Copy the two-part embed: the `<script>` tag and the `<div class="trustpilot-widget">` tag
  - You'll need: the `data-businessunit-id` value (a hex string like `65a1b2c3d4e5f6a7b8c9d0e1`)
  - Note the `data-template-id` for the Mini widget

> **Code tasks below use placeholder values. Replace before committing:**
> - `TRUSTPILOT_REVIEW_URL` → `https://www.trustpilot.com/evaluate/crewdock.app`
> - `TRUSTPILOT_BUSINESS_ID` → your actual `data-businessunit-id` hex string
> - `TRUSTPILOT_TEMPLATE_ID` → your actual `data-template-id` for chosen widget

---

## File Map

| File | Repo | Action | Change |
|---|---|---|---|
| `src/components/ReviewPopup.tsx` | apa-crew-calc | Modify | Replace placeholder URL; add 5s delay gate on claim button |
| `api/send-review-email.ts` | apa-crew-calc | Modify | Replace placeholder URL in email CTA link |
| `[landing]/index.html` or equivalent | crewdock.app | Modify | Add Trustpilot script + TrustBox widget in reviews section |

---

## Task 1: Wire Trustpilot URL into ReviewPopup + Add Delay Gate

**Repo:** `apa-crew-calc`

**Files:**
- Modify: `src/components/ReviewPopup.tsx`

The current `reviewUrl` is a placeholder (`https://crewdock.app`). We also add a 5-second countdown before the "I've left my review" claim button activates. This is a light anti-abuse gate — it confirms the user spent at least 5 seconds before claiming, without adding friction to genuine reviewers.

- [ ] **Step 1: Update the review URL**

In `src/components/ReviewPopup.tsx`, line 19, replace:

```typescript
const reviewUrl = 'https://crewdock.app'; // replace with Trustpilot/Google URL when confirmed
```

With:

```typescript
const reviewUrl = 'https://www.trustpilot.com/evaluate/crewdock.app';
```

- [ ] **Step 2: Add delay state for the claim button**

After the existing `const [loading, setLoading] = useState(false);` line (line 18), add:

```typescript
const [claimReady, setClaimReady] = useState(false);
const [countdown, setCountdown] = useState(5);
```

- [ ] **Step 3: Add useEffect to start countdown when phase becomes 'confirm'**

After the `handleClaimExtension` function (after line 42, before the return statement), add:

```typescript
useEffect(() => {
  if (phase !== 'confirm') return;
  setClaimReady(false);
  setCountdown(5);
  const interval = setInterval(() => {
    setCountdown((c) => {
      if (c <= 1) {
        clearInterval(interval);
        setClaimReady(true);
        return 0;
      }
      return c - 1;
    });
  }, 1000);
  return () => clearInterval(interval);
}, [phase]);
```

- [ ] **Step 4: Update the claim button in the `confirm` phase to use the delay gate**

Find the confirm phase button (around line 124–130):

```tsx
<button
  onClick={handleClaimExtension}
  disabled={loading}
  className="w-full bg-[#FFD528] text-[#1F1F21] font-bold py-2.5 rounded-xl text-sm hover:bg-[#FFD528]/90 transition-colors disabled:opacity-50 mb-2"
>
  {loading ? 'Activating...' : "I've left my review → Unlock 14 days"}
</button>
```

Replace with:

```tsx
<button
  onClick={handleClaimExtension}
  disabled={loading || !claimReady}
  className="w-full bg-[#FFD528] text-[#1F1F21] font-bold py-2.5 rounded-xl text-sm hover:bg-[#FFD528]/90 transition-colors disabled:opacity-50 mb-2"
>
  {loading
    ? 'Activating...'
    : !claimReady
    ? `Please wait ${countdown}s…`
    : "I've left my review → Unlock 14 days"}
</button>
```

- [ ] **Step 5: Verify the component renders correctly in browser**

Run the dev server and trigger the review popup (you can temporarily set `daysSinceCreated >= 0` in `ReviewPopupController.tsx` to force it). Confirm:
- "Leave a Review" opens `trustpilot.com/evaluate/crewdock.app` in a new tab
- After clicking, the confirm phase shows with the countdown button disabled
- After 5 seconds the button becomes active and reads "I've left my review → Unlock 14 days"
- Reverting the forced trigger in `ReviewPopupController.tsx` before committing

- [ ] **Step 6: Commit**

```bash
git add src/components/ReviewPopup.tsx
git commit -m "feat: wire Trustpilot URL and add 5s claim delay gate to review popup"
```

---

## Task 2: Update Review Email CTA Link

**Repo:** `apa-crew-calc`

**Files:**
- Modify: `api/send-review-email.ts`

The day-10 review email CTA button currently links to `https://crewdock.app`. Update it to the Trustpilot review page.

- [ ] **Step 1: Find the CTA link in the email template**

In `api/send-review-email.ts`, locate the anchor tag inside the email HTML (approximately line 39):

```html
<a href="https://crewdock.app" style="color:#1F1F21;font-weight:700;font-size:14px;text-decoration:none">Leave a Review → Get 14 Days Free</a>
```

- [ ] **Step 2: Replace the href**

```html
<a href="https://www.trustpilot.com/evaluate/crewdock.app" style="color:#1F1F21;font-weight:700;font-size:14px;text-decoration:none">Leave a Review on Trustpilot → Get 14 Days Free</a>
```

- [ ] **Step 3: Update the footer note to mention Trustpilot**

Find (approximately line 47):
```html
<p style="margin:0;font-size:13px;color:#888">After leaving your review, log in to Crew Dock and click "I've left my review" to unlock your extension.</p>
```

Replace with:
```html
<p style="margin:0;font-size:13px;color:#888">After submitting your Trustpilot review, log back in to Crew Dock and click "I've left my review" to unlock your extension.</p>
```

- [ ] **Step 4: Commit**

```bash
git add api/send-review-email.ts
git commit -m "feat: update review email CTA to Trustpilot review page"
```

---

## Task 3: TrustBox Widget on Landing Page

**Repo:** `crewdock.app` (separate repository — open that repo before starting this task)

**Files:**
- Modify: The main HTML entry point or reviews section component (exact path depends on landing page stack — confirm before starting)

> **Stack check:** Before writing any code, run `ls` in the landing page repo root and identify the framework:
> - If you see `index.html` at root with no `package.json` → plain HTML, edit `index.html` directly
> - If you see `package.json` with `next` → Next.js, the component goes in the appropriate page/section component
> - If you see `package.json` with `astro` → Astro, add to the `.astro` page file

The instructions below cover **plain HTML** and **Next.js** variants. Apply whichever matches.

### 3A: Plain HTML landing page

- [ ] **Step 1: Add Trustpilot bootstrap script to `<head>`**

Find the closing `</head>` tag and add before it:

```html
<!-- Trustpilot Widget Script -->
<script type="text/javascript" src="//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js" async></script>
```

- [ ] **Step 2: Add the reviews section to the page body**

Find a logical location in the page (after testimonials or features, before pricing/CTA) and add:

```html
<!-- Reviews Section -->
<section id="reviews" style="padding: 80px 24px; background: #1F1F21; text-align: center;">
  <p style="font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #FFD528; margin: 0 0 12px 0;">
    Trusted by Crew
  </p>
  <h2 style="font-size: 32px; font-weight: 800; color: #ffffff; margin: 0 0 40px 0; line-height: 1.2;">
    What crew members say
  </h2>

  <!-- TrustBox Widget — Mini -->
  <!-- Replace data-businessunit-id and data-template-id with your actual values from Trustpilot dashboard -->
  <div
    class="trustpilot-widget"
    data-locale="en-GB"
    data-template-id="TRUSTPILOT_TEMPLATE_ID"
    data-businessunit-id="TRUSTPILOT_BUSINESS_ID"
    data-style-height="150px"
    data-style-width="100%"
    data-theme="dark"
  >
    <a href="https://www.trustpilot.com/review/crewdock.app" target="_blank" rel="noopener noreferrer">
      Trustpilot
    </a>
  </div>
</section>
```

- [ ] **Step 3: Verify in browser**

Open the landing page locally. The TrustBox widget should render with the Trustpilot stars/rating. If it shows a blank area, the `data-businessunit-id` or `data-template-id` values are likely wrong — double-check against the Trustpilot dashboard.

> Note: Until you have at least one review, Trustpilot may show the widget in a placeholder/empty state. This is expected.

- [ ] **Step 4: Commit (in the crewdock.app repo)**

```bash
git add index.html
git commit -m "feat: add Trustpilot TrustBox reviews section to landing page"
```

### 3B: Next.js landing page (if applicable)

- [ ] **Step 1: Add Trustpilot script to the document `<head>`**

In `app/layout.tsx` (App Router) or `pages/_document.tsx` (Pages Router), add inside the `<head>`:

```tsx
<script
  type="text/javascript"
  src="//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"
  async
/>
```

- [ ] **Step 2: Create a `TrustBoxWidget` client component**

Create `components/TrustBoxWidget.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';

export function TrustBoxWidget() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Trustpilot && ref.current) {
      (window as any).Trustpilot.loadFromElement(ref.current, true);
    }
  }, []);

  return (
    <div
      ref={ref}
      className="trustpilot-widget"
      data-locale="en-GB"
      data-template-id="TRUSTPILOT_TEMPLATE_ID"
      data-businessunit-id="TRUSTPILOT_BUSINESS_ID"
      data-style-height="150px"
      data-style-width="100%"
      data-theme="dark"
    >
      <a
        href="https://www.trustpilot.com/review/crewdock.app"
        target="_blank"
        rel="noopener noreferrer"
      >
        Trustpilot
      </a>
    </div>
  );
}
```

> The `useEffect` call is needed because Next.js SSR won't run the Trustpilot bootstrap script — we manually trigger it client-side after mount.

- [ ] **Step 3: Add the reviews section to the landing page**

In the appropriate page file (e.g. `app/page.tsx` or `pages/index.tsx`), import and use the component:

```tsx
import { TrustBoxWidget } from '@/components/TrustBoxWidget';

// Add inside the page JSX, after features / before pricing:
<section className="py-20 bg-[#1F1F21] text-center px-6">
  <p className="text-[#FFD528] text-xs font-bold tracking-widest uppercase mb-3 font-mono">
    Trusted by Crew
  </p>
  <h2 className="text-3xl font-extrabold text-white mb-10">
    What crew members say
  </h2>
  <div className="max-w-2xl mx-auto">
    <TrustBoxWidget />
  </div>
</section>
```

- [ ] **Step 4: Run dev server and verify widget renders**

```bash
npm run dev
```

Open `http://localhost:3000` and confirm the TrustBox widget appears. Check browser console for errors. The widget may appear empty until reviews exist — that's expected.

- [ ] **Step 5: Commit (in the crewdock.app repo)**

```bash
git add components/TrustBoxWidget.tsx app/page.tsx
git commit -m "feat: add Trustpilot TrustBox reviews section to landing page"
```

---

## Post-launch Checklist

- [ ] Confirm `https://www.trustpilot.com/review/crewdock.app` loads the business profile
- [ ] Test the full flow: app popup → Trustpilot tab opens → countdown → claim button → 14-day extension granted
- [ ] Verify the review email (trigger via ReviewPopupController or Resend test) — CTA link goes to Trustpilot
- [ ] Landing page TrustBox renders without console errors
- [ ] Push both repos — Vercel auto-deploys each independently

---

## What's Explicitly Out of Scope

- Verified review webhook (Trustpilot doesn't offer this on Free tier)
- Displaying individual reviews as hardcoded testimonials (use TrustBox widget instead)
- Multiple Trustpilot business profiles (one profile per domain — crewdock.app covers both repos)
