# What's New Notification Centre — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "What's New" bell icon to the dashboard that opens a slide-out drawer showing release notifications, backed by a Supabase table and an admin publish form with live preview.

**Architecture:** A `WhatsNewDrawer` component fetches from `release_notifications` table and tracks read state in `localStorage`. The dashboard bell button (Lucide `Bell`, red badge) is added rightmost in the action bar. The AdminPage gains a third "Notifications" tab with a publish form and live card preview panel.

**Tech Stack:** React + TypeScript, Tailwind CSS, Lucide React, Supabase (Postgres + Storage), localStorage for read state.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260411_release_notifications.sql` | Create | DB table + RLS + Storage bucket |
| `src/components/WhatsNewDrawer.tsx` | Create | Drawer UI + data fetching + read state |
| `src/pages/DashboardPage.tsx` | Modify | Add bell button + render drawer |
| `src/pages/AdminPage.tsx` | Modify | Add notifications tab + publish form |

---

## Task 1: DB migration — `release_notifications` table + Storage bucket

**Files:**
- Create: `supabase/migrations/20260411_release_notifications.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ── release_notifications table ──────────────────────────────────────────────
CREATE TABLE public.release_notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text        NOT NULL,
  description   text        NOT NULL,
  category      text        NOT NULL,
  discover_link text        NOT NULL,
  image_url     text,
  published_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.release_notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.release_notifications TO authenticated;
GRANT SELECT ON public.release_notifications TO anon;
GRANT ALL    ON public.release_notifications TO service_role;

-- All authenticated users can read
CREATE POLICY "anyone_select_release_notifications"
  ON public.release_notifications FOR SELECT
  TO authenticated
  USING (true);

-- Only the admin email can write
CREATE POLICY "admin_insert_release_notifications"
  ON public.release_notifications FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'email') = 'milo.cosemans@gmail.com');

CREATE POLICY "admin_update_release_notifications"
  ON public.release_notifications FOR UPDATE
  TO authenticated
  USING  ((auth.jwt() ->> 'email') = 'milo.cosemans@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'milo.cosemans@gmail.com');

CREATE POLICY "admin_delete_release_notifications"
  ON public.release_notifications FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'milo.cosemans@gmail.com');

-- ── Supabase Storage bucket ───────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('notification-images', 'notification-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admin to upload
CREATE POLICY "admin_upload_notification_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'notification-images'
    AND (auth.jwt() ->> 'email') = 'milo.cosemans@gmail.com'
  );

-- Allow admin to delete
CREATE POLICY "admin_delete_notification_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'notification-images'
    AND (auth.jwt() ->> 'email') = 'milo.cosemans@gmail.com'
  );

-- Public read for the bucket objects
CREATE POLICY "public_read_notification_images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'notification-images');
```

- [ ] **Step 2: Apply the migration**

Run in the Supabase SQL Editor (app.supabase.com → project → SQL Editor), or:

```bash
supabase db push
```

Expected: no errors. Table `release_notifications` appears in the Table Editor. Bucket `notification-images` appears in Storage.

- [ ] **Step 3: Verify with a test insert + select**

In the Supabase SQL Editor:

```sql
INSERT INTO public.release_notifications (title, description, category, discover_link)
VALUES ('Test notification', 'Testing the table.', 'Dashboard', '/dashboard');

SELECT * FROM public.release_notifications;
-- Should return 1 row

DELETE FROM public.release_notifications WHERE title = 'Test notification';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260411_release_notifications.sql
git commit -m "feat: add release_notifications table and notification-images storage bucket"
git push
```

---

## Task 2: `WhatsNewDrawer` component

**Files:**
- Create: `src/components/WhatsNewDrawer.tsx`

- [ ] **Step 1: Create the file with types and the read-state hook**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, MessageSquarePlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const LAST_SEEN_KEY = 'whats_new_last_seen';
const PAGE_SIZE = 7;

interface ReleaseNotification {
  id: string;
  title: string;
  description: string;
  category: string;
  discover_link: string;
  image_url: string | null;
  published_at: string;
}

/** Returns the count of notifications newer than the stored last-seen timestamp. */
export function useUnreadCount(notifications: { published_at: string }[]): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    if (!lastSeen) {
      setCount(notifications.length);
      return;
    }
    const ts = parseInt(lastSeen, 10);
    setCount(
      notifications.filter(n => new Date(n.published_at).getTime() > ts).length
    );
  }, [notifications]);

  return count;
}
```

- [ ] **Step 2: Add the drawer component**

Append to `src/components/WhatsNewDrawer.tsx`:

```tsx
interface WhatsNewDrawerProps {
  open: boolean;
  onClose: () => void;
  onSeen: () => void; // called after open so parent can clear badge
}

export function WhatsNewDrawer({ open, onClose, onSeen }: WhatsNewDrawerProps) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<ReleaseNotification[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('release_notifications')
      .select('id, title, description, category, discover_link, image_url, published_at')
      .order('published_at', { ascending: false });
    if (!error && data) setNotifications(data as ReleaseNotification[]);
    setLoading(false);
  }, []);

  // Fetch once on mount
  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Mark unread ids before clearing them
  useEffect(() => {
    if (!open) return;
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    const ts = lastSeen ? parseInt(lastSeen, 10) : 0;
    const ids = new Set(
      notifications
        .filter(n => new Date(n.published_at).getTime() > ts)
        .map(n => n.id)
    );
    setUnreadIds(ids);

    // After a short delay, mark as seen and notify parent
    const t = setTimeout(() => {
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
      setUnreadIds(new Set());
      onSeen();
    }, 700);
    return () => clearTimeout(t);
  }, [open, notifications, onSeen]);

  const visible = notifications.slice(0, visibleCount);
  const hasMore = notifications.length > visibleCount;

  return (
    <>
      {/* Backdrop (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 right-0 bottom-0 z-40 w-[400px] max-w-[100vw] bg-[#1F1F21] flex flex-col',
          'transition-transform duration-300 ease-in-out',
          'rounded-l-2xl shadow-2xl',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/8 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold text-white font-mono">What's New</h2>
              {unreadIds.size > 0 && (
                <span className="bg-[#FFD528] text-[#1F1F21] text-[10px] font-black px-2 py-0.5 rounded-full">
                  {unreadIds.size} NEW
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md bg-white/8 hover:bg-white/15 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Feature request CTA */}
          <button
            onClick={() => { navigate('/support'); onClose(); }}
            className="w-full flex items-center justify-between gap-3 bg-[#FFD528]/8 hover:bg-[#FFD528]/13 border border-[#FFD528]/20 rounded-xl px-4 py-3 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <MessageSquarePlus className="h-4 w-4 text-[#FFD528] shrink-0" />
              <div>
                <p className="text-[12px] font-bold text-white font-mono leading-tight">Request a Feature</p>
                <p className="text-[11px] text-white/40 font-mono">Tell us what you need next</p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-white/25 shrink-0" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && notifications.length === 0 && (
            <p className="text-center text-white/30 text-xs font-mono py-12">Loading...</p>
          )}

          {visible.map(n => (
            <div
              key={n.id}
              className={cn(
                'rounded-xl overflow-hidden border transition-colors',
                unreadIds.has(n.id)
                  ? 'bg-[#FFD528]/7 border-[#FFD528]/25'
                  : 'bg-white/5 border-white/8'
              )}
            >
              {/* Image */}
              {n.image_url ? (
                <img
                  src={n.image_url}
                  alt={n.title}
                  className="w-full h-[140px] object-cover block"
                />
              ) : (
                <div className="w-full h-[140px] bg-[#2a2a2c] flex items-center justify-center">
                  <span className="text-[10px] text-white/20 uppercase tracking-widest font-mono">Feature image</span>
                </div>
              )}

              {/* Body */}
              <div className="p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase tracking-widest bg-[#FFD528]/15 text-[#FFD528] px-2 py-0.5 rounded-full">
                    {n.category}
                  </span>
                  <span className="text-[10px] text-white/30 font-mono">
                    {new Date(n.published_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <h3 className="text-[13px] font-bold text-white font-mono leading-snug mb-1.5">{n.title}</h3>
                <p className="text-[11px] text-white/50 font-mono leading-relaxed mb-3">{n.description}</p>
                <button
                  onClick={() => { navigate(n.discover_link); onClose(); }}
                  className="inline-flex items-center gap-1.5 bg-[#FFD528] text-[#1F1F21] text-[11px] font-bold px-3 py-1.5 rounded-md font-mono"
                >
                  Discover {n.category}
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="w-full py-2.5 text-[12px] font-semibold text-white/40 border border-white/10 rounded-lg font-mono hover:text-white/70 hover:border-white/20 transition-colors"
            >
              See more releases
            </button>
          )}

          {!loading && notifications.length === 0 && (
            <p className="text-center text-white/25 text-xs font-mono py-12">No releases yet</p>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify the file compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `src/components/WhatsNewDrawer.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/WhatsNewDrawer.tsx
git commit -m "feat: add WhatsNewDrawer component with unread state and paginated release feed"
git push
```

---

## Task 3: Bell button + drawer wiring in DashboardPage

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/pages/DashboardPage.tsx`, add to the existing lucide-react import line:

```tsx
// Add Bell to the existing lucide-react import:
import {
  Plus, FolderOpen, Star, StarOff, ChevronLeft, ChevronRight,
  Calendar, PoundSterling, Clock, X, TrendingUp, Sparkles, ExternalLink, Bell
} from 'lucide-react';
```

And add the component + hook imports after the existing component imports:

```tsx
import { WhatsNewDrawer, useUnreadCount } from '@/components/WhatsNewDrawer';
```

- [ ] **Step 2: Add drawer state to the component**

Inside `DashboardPage`, after the existing `useState` declarations, add:

```tsx
const [whatsNewOpen, setWhatsNewOpen] = useState(false);
const [notifications, setNotifications] = useState<{ id: string; published_at: string }[]>([]);
const [badgeCount, setBadgeCount] = useState(0);
const unreadCount = useUnreadCount(notifications);
```

Then fetch the minimal notification list on mount to power the badge (add inside the existing `useEffect` block that runs on `user`, or as a separate effect):

```tsx
useEffect(() => {
  async function fetchBadge() {
    const { data } = await supabase
      .from('release_notifications')
      .select('id, published_at')
      .order('published_at', { ascending: false });
    if (data) setNotifications(data);
  }
  if (user) fetchBadge();
}, [user]);
```

And sync badgeCount from unreadCount:

```tsx
useEffect(() => { setBadgeCount(unreadCount); }, [unreadCount]);
```

- [ ] **Step 3: Replace the action bar and add the drawer**

Find the action bar block (around line 334):

```tsx
<div className="flex items-center gap-2 shrink-0 mt-1">
  <Button variant="outline" onClick={() => navigate('/ai-input')} className="gap-2">
    <Sparkles className="h-4 w-4" /><span className="hidden sm:inline"> AI Input</span>
  </Button>
  <Button
    onClick={() => {
      if (!isPremium && projects.length >= 10) { setJobLimitOpen(true); return; }
      setShowNewProject(true);
    }}
    className="gap-2"
  >
    <Plus className="h-4 w-4" /> New Job
  </Button>
</div>
```

Replace with:

```tsx
<div className="flex items-center gap-2 shrink-0 mt-1">
  <Button variant="outline" onClick={() => navigate('/ai-input')} className="gap-2">
    <Sparkles className="h-4 w-4" /><span className="hidden sm:inline"> AI Input</span>
  </Button>
  <Button
    onClick={() => {
      if (!isPremium && projects.length >= 10) { setJobLimitOpen(true); return; }
      setShowNewProject(true);
    }}
    className="gap-2"
  >
    <Plus className="h-4 w-4" /> New Job
  </Button>
  {/* Bell — rightmost */}
  <button
    onClick={() => setWhatsNewOpen(true)}
    className="relative w-9 h-9 rounded-lg border border-border bg-background hover:bg-accent flex items-center justify-center transition-colors"
    title="What's new"
  >
    <Bell className="h-4 w-4" />
    {badgeCount > 0 && (
      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 border-2 border-background">
        {badgeCount}
      </span>
    )}
  </button>
</div>
```

- [ ] **Step 4: Add the drawer just before the closing tag of the component's return**

Find the last `</>` or `</div>` closing the DashboardPage return. Add the drawer and a main-content shift wrapper before it:

```tsx
<WhatsNewDrawer
  open={whatsNewOpen}
  onClose={() => setWhatsNewOpen(false)}
  onSeen={() => setBadgeCount(0)}
/>
```

Also add a right-margin transition to the main content area so the drawer pushes content left. Find the outermost wrapper div in the DashboardPage return (the one with `className="space-y-..."` or similar) and add a class:

```tsx
// Add to the outer container div:
className={cn('transition-all duration-300', whatsNewOpen ? 'mr-[400px]' : 'mr-0')}
```

Note: `cn` is already imported in DashboardPage. If not, add `import { cn } from '@/lib/utils';`.

- [ ] **Step 5: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat: add What's New bell icon and drawer to dashboard"
git push
```

---

## Task 4: Admin Notifications tab in AdminPage

**Files:**
- Modify: `src/pages/AdminPage.tsx`

- [ ] **Step 1: Add the `AdminNotification` type and imports**

Near the top of `AdminPage.tsx`, after the existing interface declarations, add:

```tsx
import { Upload, Trash2, Pencil, ArrowRight } from 'lucide-react';
// (add to existing lucide import line — merge with existing imports)
```

Add the interface:

```tsx
interface AdminNotification {
  id: string;
  title: string;
  description: string;
  category: string;
  discover_link: string;
  image_url: string | null;
  published_at: string;
}

const NOTIFICATION_CATEGORIES = [
  'Timesheets', 'Dashboard', 'Bookkeeping', 'Calculator',
  'Projects', 'Settings', 'Subscription', 'General',
];
```

- [ ] **Step 2: Expand the `adminTab` union type**

Find:

```tsx
const [adminTab, setAdminTab] = useState<'dashboard' | 'feature-requests'>('dashboard');
```

Replace with:

```tsx
const [adminTab, setAdminTab] = useState<'dashboard' | 'feature-requests' | 'notifications'>('dashboard');
```

- [ ] **Step 3: Add the Notifications tab to the tab row**

Find the tab array (around line 665):

```tsx
{[
  { id: 'dashboard' as const, label: 'Dashboard', icon: BarChart2 },
  { id: 'feature-requests' as const, label: 'Feature Requests', icon: Lightbulb },
].map(({ id, label, icon: Icon }) => (
```

Replace with:

```tsx
{[
  { id: 'dashboard' as const, label: 'Dashboard', icon: BarChart2 },
  { id: 'feature-requests' as const, label: 'Feature Requests', icon: Lightbulb },
  { id: 'notifications' as const, label: 'Notifications', icon: Zap },
].map(({ id, label, icon: Icon }) => (
```

(`Zap` is already imported in AdminPage.)

- [ ] **Step 4: Update the refresh button subtitle**

Find:

```tsx
{adminTab === 'dashboard' ? 'Platform analytics — visible only to you' : 'Manage feature requests'}
```

Replace with:

```tsx
{adminTab === 'dashboard'
  ? 'Platform analytics — visible only to you'
  : adminTab === 'feature-requests'
  ? 'Manage feature requests'
  : 'Publish release notifications'}
```

- [ ] **Step 5: Update the refresh button handler**

Find:

```tsx
onClick={adminTab === 'dashboard' ? fetchStats : loadAdminFeatureRequests}
disabled={adminTab === 'dashboard' ? loading : frLoading}
```

Replace with:

```tsx
onClick={adminTab === 'dashboard' ? fetchStats : adminTab === 'feature-requests' ? loadAdminFeatureRequests : undefined}
disabled={adminTab === 'dashboard' ? loading : adminTab === 'feature-requests' ? frLoading : false}
```

- [ ] **Step 6: Add the `AdminNotificationsPanel` component**

Add this component **above** the `AdminPage` function export (before `export function AdminPage()`):

```tsx
function AdminNotificationsPanel() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [discoverLink, setDiscoverLink] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchNotifications() {
    setLoading(true);
    const { data, error } = await supabase
      .from('release_notifications')
      .select('*')
      .order('published_at', { ascending: false });
    if (!error && data) setNotifications(data as AdminNotification[]);
    setLoading(false);
  }

  useEffect(() => { fetchNotifications(); }, []);

  function resetForm() {
    setEditId(null);
    setTitle('');
    setDescription('');
    setCategory('');
    setDiscoverLink('');
    setImageFile(null);
    setImagePreviewUrl(null);
    setExistingImageUrl(null);
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreviewUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function startEdit(n: AdminNotification) {
    setEditId(n.id);
    setTitle(n.title);
    setDescription(n.description);
    setCategory(n.category);
    setDiscoverLink(n.discover_link);
    setExistingImageUrl(n.image_url);
    setImagePreviewUrl(n.image_url);
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim() || !category || !discoverLink.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      let imageUrl: string | null = existingImageUrl ?? null;

      // Upload new image if selected
      if (imageFile) {
        const ext = imageFile.name.split('.').pop();
        const path = `${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('notification-images')
          .upload(path, imageFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from('notification-images')
          .getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }

      const payload = {
        title: title.trim(),
        description: description.trim(),
        category,
        discover_link: discoverLink.trim(),
        image_url: imageUrl,
      };

      if (editId) {
        const { error: updateError } = await supabase
          .from('release_notifications')
          .update(payload)
          .eq('id', editId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('release_notifications')
          .insert(payload);
        if (insertError) throw insertError;
      }

      resetForm();
      await fetchNotifications();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this notification? Users will no longer see it.')) return;
    await supabase.from('release_notifications').delete().eq('id', id);
    await fetchNotifications();
  }

  const previewImageSrc = imagePreviewUrl;
  const previewDate = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 mt-4">

      {/* ── Left: form + list ── */}
      <div className="space-y-6">

        {/* Form */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest font-mono mb-4">
            {editId ? 'Edit release' : 'Publish new release'}
          </h3>

          {error && (
            <div className="bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-mono rounded-xl p-3 mb-4">
              {error}
            </div>
          )}

          {/* Image upload */}
          <div className="mb-4">
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest font-mono mb-2">
              Feature image
            </label>
            <div
              className="border-2 border-dashed border-white/15 hover:border-[#FFD528]/40 rounded-xl overflow-hidden cursor-pointer transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {previewImageSrc ? (
                <img src={previewImageSrc} alt="Preview" className="w-full h-28 object-cover block" />
              ) : (
                <div className="h-28 flex flex-col items-center justify-center gap-2">
                  <Upload className="h-5 w-5 text-white/20" />
                  <span className="text-[11px] text-white/25 font-mono">Click to upload — JPG, PNG, WebP</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
          </div>

          {/* Category + Link */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest font-mono mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white font-mono appearance-none focus:outline-none focus:border-[#FFD528]/50"
              >
                <option value="">Select...</option>
                {NOTIFICATION_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest font-mono mb-1.5">
                Discover link
              </label>
              <input
                value={discoverLink}
                onChange={e => setDiscoverLink(e.target.value)}
                placeholder="/invoice"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white font-mono focus:outline-none focus:border-[#FFD528]/50"
              />
            </div>
          </div>

          {/* Title */}
          <div className="mb-3">
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest font-mono mb-1.5">
              Title
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Timesheet Export is now live"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white font-mono focus:outline-none focus:border-[#FFD528]/50"
            />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest font-mono mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the new feature in 1–2 sentences..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white font-mono resize-none focus:outline-none focus:border-[#FFD528]/50"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-white/8">
            {editId && (
              <button
                onClick={resetForm}
                className="text-[12px] text-white/40 hover:text-white/70 font-mono transition-colors"
              >
                Cancel edit
              </button>
            )}
            {!editId && <span className="text-[11px] text-white/25 font-mono">Visible to all users immediately</span>}
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 bg-[#FFD528] text-[#1F1F21] text-[13px] font-bold px-5 py-2 rounded-lg font-mono disabled:opacity-50"
            >
              {saving ? 'Saving...' : editId ? 'Save changes' : 'Publish Release'}
            </button>
          </div>
        </div>

        {/* Published list */}
        <div>
          <h3 className="text-[11px] font-bold text-white/40 uppercase tracking-widest font-mono mb-3">
            Published releases
          </h3>
          {loading && (
            <p className="text-xs text-white/25 font-mono py-4">Loading...</p>
          )}
          {notifications.map(n => (
            <div key={n.id} className="flex items-center gap-3 bg-white/5 border border-white/8 rounded-xl p-3 mb-2">
              {n.image_url ? (
                <img src={n.image_url} alt="" className="w-12 h-9 object-cover rounded-md shrink-0" />
              ) : (
                <div className="w-12 h-9 bg-white/10 rounded-md shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-white font-mono truncate">{n.title}</p>
                <p className="text-[10px] text-white/35 font-mono">{n.category} · {new Date(n.published_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} · {n.discover_link}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => startEdit(n)}
                  className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white border border-white/10 hover:border-white/25 px-2.5 py-1.5 rounded-lg font-mono transition-colors"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  onClick={() => handleDelete(n.id)}
                  className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 px-2.5 py-1.5 rounded-lg font-mono transition-colors"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </div>
          ))}
          {!loading && notifications.length === 0 && (
            <p className="text-xs text-white/25 font-mono py-4">No releases published yet.</p>
          )}
        </div>
      </div>

      {/* ── Right: live preview ── */}
      <div className="xl:sticky xl:top-0">
        <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest font-mono mb-3">Live preview</p>

        {/* Mini drawer chrome */}
        <div className="bg-[#161618] border border-white/8 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-white font-mono">What's New</span>
              <span className="bg-[#FFD528] text-[#1F1F21] text-[9px] font-black px-2 py-0.5 rounded-full">1 NEW</span>
            </div>
            <div className="w-6 h-6 bg-white/8 rounded-md flex items-center justify-center">
              <X className="h-3 w-3 text-white/40" />
            </div>
          </div>

          <div className="p-3">
            {/* Preview card */}
            <div className="bg-[#FFD528]/7 border border-[#FFD528]/25 rounded-xl overflow-hidden">
              {/* Image */}
              {previewImageSrc ? (
                <img src={previewImageSrc} alt="Preview" className="w-full h-[120px] object-cover block" />
              ) : (
                <div className="w-full h-[120px] bg-white/5 flex items-center justify-center">
                  <span className="text-[9px] text-white/20 uppercase tracking-widest font-mono">Feature image</span>
                </div>
              )}

              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase tracking-widest bg-[#FFD528]/15 text-[#FFD528] px-2 py-0.5 rounded-full">
                    {category || 'Category'}
                  </span>
                  <span className="text-[9px] text-white/30 font-mono">{previewDate}</span>
                </div>
                <p className="text-[12px] font-bold text-white font-mono leading-snug mb-1" style={{ color: title ? '#fff' : 'rgba(255,255,255,0.2)' }}>
                  {title || 'Your title will appear here'}
                </p>
                <p className="text-[10px] font-mono leading-relaxed mb-2.5" style={{ color: description ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)' }}>
                  {description || 'Your description will appear here...'}
                </p>
                <button className="inline-flex items-center gap-1 bg-[#FFD528] text-[#1F1F21] text-[10px] font-bold px-2.5 py-1.5 rounded-md font-mono">
                  Discover {category || '...'} <ArrowRight className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Note: add `import { ArrowRight, Upload, Trash2, Pencil } from 'lucide-react';` to the existing lucide import.

- [ ] **Step 7: Render the tab panel**

Find (around line 1117):

```tsx
{adminTab === 'feature-requests' && (
  <AdminFeatureRequests reloadRef={frReloadRef} onLoadingChange={setFrLoading} />
)}
```

Add after it:

```tsx
{adminTab === 'notifications' && (
  <AdminNotificationsPanel />
)}
```

- [ ] **Step 8: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/pages/AdminPage.tsx
git commit -m "feat: add Notifications tab to admin page with publish form and live preview"
git push
```

---

## Task 5: End-to-end smoke test

- [ ] **Step 1: Publish a test notification via the admin form**

1. Navigate to `/admin` (logged in as milo.cosemans@gmail.com)
2. Click the "Notifications" tab
3. Upload an image, fill in all fields, click "Publish Release"
4. Verify the new row appears in the "Published releases" list below the form

- [ ] **Step 2: Verify the bell badge appears on the dashboard**

1. Navigate to `/dashboard`
2. Confirm the bell icon is the rightmost button in the top-right action bar
3. Confirm a red badge with "1" (or the correct unread count) is visible

- [ ] **Step 3: Open the drawer and verify all elements**

1. Click the bell
2. Confirm the drawer slides in from the right and the main content shifts left
3. Confirm the "Request a Feature" CTA is at the top
4. Confirm the notification card shows the uploaded image, category tag, title, description, and "Discover X" button
5. Confirm the badge on the bell disappears after ~700 ms
6. Click "Discover [Category]" — confirm it navigates to the correct route and closes the drawer

- [ ] **Step 4: Verify "Request a Feature" link**

1. Open the drawer
2. Click "Request a Feature"
3. Confirm it navigates to `/support` and the drawer closes

- [ ] **Step 5: Verify "See more" pagination**

1. Publish 8 or more notifications via the admin tab
2. Open the drawer — confirm only 7 are visible
3. Click "See more releases" — confirm remaining notifications load

- [ ] **Step 6: Verify edit and delete in admin**

1. In the admin Notifications tab, click "Edit" on a published notification
2. Confirm the form re-populates with the existing values
3. Change the title, click "Save changes"
4. Confirm the updated title appears in the published list
5. Click "Delete" on a notification, confirm it is removed

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: smoke test complete — What's New notification centre"
git push
```
