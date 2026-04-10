# What's New Notification Centre — Design Spec

## Summary

A slide-out drawer accessible via a bell icon (rightmost in the dashboard action bar) that surfaces release notifications to all users. New notifications show a red unread count badge on the bell. Opening the drawer clears the badge. Each notification card has an optional feature image, category tag, title, description, and a "Discover X" button that deep-links to the relevant page. An admin-only tab in the Admin page lets Milo publish, edit, and delete notifications with a live card preview.

---

## User-facing drawer

**Entry point:** SVG bell icon (Lucide `Bell`) placed to the right of the "New Job" button in the dashboard header. A red badge displays the unread count. Badge disappears when the drawer is opened.

**Read state:** Stored as a UTC timestamp `whats_new_last_seen` in `localStorage`. Any notification with `published_at > last_seen` is considered unread. Opening the drawer writes `Date.now()` to `localStorage` and visually clears the unread highlights after 700 ms.

**Drawer behaviour:**
- Slides in from the right, pushing the main content left (not overlaying)
- Charcoal (`#1F1F21`) background, consistent with the sidebar
- Header: "What's New" title + yellow unread pill + close button
- Below header: "Request a Feature" CTA row → navigates to `/support`
- Body: scrollable list of notification cards, newest first
- Initially shows 7 cards; a "See more releases" button loads all remaining

**Notification card anatomy (top to bottom):**
1. Feature image — full-width, 140 px tall, `object-fit: cover`; if no image set, a dark placeholder is shown
2. Category tag (yellow pill) + date label (right-aligned)
3. Title (bold, white)
4. Description (muted white)
5. "Discover [Category] →" button (yellow, solid)

---

## Data

**Table: `public.release_notifications`**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto |
| title | text NOT NULL | |
| description | text NOT NULL | |
| category | text NOT NULL | e.g. "Timesheets" |
| discover_link | text NOT NULL | e.g. "/invoice" |
| image_url | text | nullable; public Supabase Storage URL |
| published_at | timestamptz | default now() |
| created_at | timestamptz | default now() |

**RLS:** `SELECT` for all authenticated users. `INSERT / UPDATE / DELETE` only for the admin email (`milo.cosemans@gmail.com`) via `auth.jwt() ->> 'email'` check.

**Storage bucket:** `notification-images` (public). Admin uploads an image file → client uploads to bucket → stores the public URL in `image_url`.

**Subscriptions table:** No change needed. Unread state is stored in `localStorage` only.

---

## Admin Notifications tab

Located in `AdminPage` as a third tab alongside "Dashboard" and "Feature Requests". Admin-only (same email gate as the rest of the page).

**Layout:** Two-column split
- Left: publish form + published list
- Right: live preview panel (mini drawer chrome showing the card as it will appear)

**Form fields:** Feature image (upload), Category (select), Discover link (text input), Title (text input), Description (textarea), Publish button.

**Live preview:** Updates in real-time as form fields change. Image upload triggers a `FileReader` preview. Discover button label updates to "Discover [Category]".

**Published list:** Rows showing image thumbnail, title, category, date, link. Edit (re-populates form) and Delete buttons per row.

---

## No emojis

All icons use Lucide SVG icons. No emoji characters anywhere in the UI.
