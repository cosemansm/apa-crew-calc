# Feature Requests Admin Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Feature Requests management tab to the Admin Dashboard so the admin can create, edit, delete, and change the status of feature requests.

**Architecture:** Add a tab row to `AdminPage.tsx` toggling between the existing analytics view and a new inline CRUD list. All Supabase reads/writes happen directly in the component (no new edge function). A DB migration renames `submitted` → `requested` in the `feature_requests` status column.

**Tech Stack:** React, TypeScript, Tailwind CSS, Supabase JS client, lucide-react icons

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260409_rename_submitted_to_requested.sql` | Create | DB migration: rename status value |
| `src/pages/AdminPage.tsx` | Modify | Add tab state, tab row UI, Feature Requests tab component |
| `src/pages/SupportPage.tsx` | Modify | Update `status` type and display labels for `requested` |

---

### Task 1: DB Migration — rename `submitted` → `requested`

**Files:**
- Create: `supabase/migrations/20260409_rename_submitted_to_requested.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Rename feature_requests status value: submitted → requested

-- 1. Drop the existing check constraint (name may vary — adjust if needed)
ALTER TABLE public.feature_requests
  DROP CONSTRAINT IF EXISTS feature_requests_status_check;

-- 2. Update existing rows
UPDATE public.feature_requests
  SET status = 'requested'
  WHERE status = 'submitted';

-- 3. Re-add check constraint with new value set
ALTER TABLE public.feature_requests
  ADD CONSTRAINT feature_requests_status_check
  CHECK (status IN ('requested', 'planned', 'in_progress', 'completed'));
```

- [ ] **Step 2: Apply the migration in the Supabase dashboard**

Go to the Supabase dashboard → SQL editor → paste and run the migration SQL.
Verify with: `SELECT DISTINCT status FROM feature_requests;`
Expected: rows showing `requested`, `planned`, `in_progress`, or `completed` — no `submitted` rows remain.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/20260409_rename_submitted_to_requested.sql
git commit -m "feat: rename feature_requests status submitted → requested"
```

---

### Task 2: Update SupportPage — status type and display labels

**Files:**
- Modify: `src/pages/SupportPage.tsx`

- [ ] **Step 1: Update the `FeatureRequest` interface status union**

Find (line ~32):
```ts
status: 'submitted' | 'planned' | 'in_progress' | 'completed';
```
Replace with:
```ts
status: 'requested' | 'planned' | 'in_progress' | 'completed';
```

- [ ] **Step 2: Update `STATUS_STYLES`**

Find (line ~70):
```ts
const STATUS_STYLES: Record<string, string> = {
  submitted:   'bg-gray-100 text-gray-600',
  planned:     'bg-blue-50 text-blue-600',
  in_progress: 'bg-amber-50 text-amber-700',
  completed:   'bg-green-50 text-green-700',
};
```
Replace with:
```ts
const STATUS_STYLES: Record<string, string> = {
  requested:   'bg-gray-100 text-gray-600',
  planned:     'bg-blue-50 text-blue-600',
  in_progress: 'bg-amber-50 text-amber-700',
  completed:   'bg-green-50 text-green-700',
};
```

- [ ] **Step 3: Update `STATUS_LABELS`**

Find (line ~77):
```ts
const STATUS_LABELS: Record<string, string> = {
  submitted:   'Submitted',
  planned:     'Planned',
  in_progress: 'In Progress',
  completed:   'Done',
};
```
Replace with:
```ts
const STATUS_LABELS: Record<string, string> = {
  requested:   'Requested',
  planned:     'Planned',
  in_progress: 'In Progress',
  completed:   'Done',
};
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/SupportPage.tsx
git commit -m "feat: update SupportPage status labels for requested rename"
git push
```

---

### Task 3: AdminPage — add tab state and tab row UI

**Files:**
- Modify: `src/pages/AdminPage.tsx`

- [ ] **Step 1: Add `adminTab` state, `useRef` import, and `Lightbulb` icon**

At the top of the file, update the React import:
```ts
import { useEffect, useState, useRef } from 'react';
```

Update the lucide-react import to add `Lightbulb`:
```ts
import { Users, Briefcase, CalendarDays, PoundSterling, TrendingUp, Zap, RefreshCw, BarChart2, Lightbulb } from 'lucide-react';
```

Inside `AdminPage()`, after the existing state declarations (around line 139), add:
```ts
const [adminTab, setAdminTab] = useState<'dashboard' | 'feature-requests'>('dashboard');
```

- [ ] **Step 2: Update the header subtitle to be dynamic**

Find (line ~267):
```tsx
<p className="text-xs text-white/30 mt-0.5">Platform analytics — visible only to you</p>
```
Replace with:
```tsx
<p className="text-xs text-white/30 mt-0.5">
  {adminTab === 'dashboard' ? 'Platform analytics — visible only to you' : 'Manage feature requests'}
</p>
```

- [ ] **Step 3: Update the Refresh button to scope to the active tab**

Find (line ~269):
```tsx
<button
  onClick={fetchStats}
  disabled={loading}
  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-mono transition-all disabled:opacity-40"
>
  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
  Refresh
</button>
```
Replace with:
```tsx
<button
  onClick={adminTab === 'dashboard' ? fetchStats : loadAdminFeatureRequests}
  disabled={adminTab === 'dashboard' ? loading : frLoading}
  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-mono transition-all disabled:opacity-40"
>
  <RefreshCw className={`h-3.5 w-3.5 ${(adminTab === 'dashboard' ? loading : frLoading) ? 'animate-spin' : ''}`} />
  Refresh
</button>
```

- [ ] **Step 4: Add the tab row after the closing `</div>` of the header block**

The header block ends at `</div>` (closing the `flex items-center justify-between mb-4` div, line ~277). Immediately after it, add:

```tsx
{/* Tab row */}
<div className="flex gap-1 mb-2">
  {[
    { id: 'dashboard' as const, label: 'Dashboard', icon: BarChart2 },
    { id: 'feature-requests' as const, label: 'Feature Requests', icon: Lightbulb },
  ].map(({ id, label, icon: Icon }) => (
    <button
      key={id}
      onClick={() => setAdminTab(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono transition-all ${
        adminTab === id
          ? 'bg-[#FFD528]/15 text-[#FFD528] border border-[#FFD528]/25'
          : 'bg-white/5 text-white/40 hover:text-white/70 border border-transparent'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  ))}
</div>
```

- [ ] **Step 5: Wrap existing stats content in a conditional**

Find (line ~279):
```tsx
{loading && !stats && (
```
This is the start of the analytics content. Wrap everything from here to the end of the `{stats && ( ... )}` block in:
```tsx
{adminTab === 'dashboard' && (
  <>
    {/* existing loading/error/stats JSX unchanged */}
  </>
)}
```

And add after it:
```tsx
{adminTab === 'feature-requests' && (
  <AdminFeatureRequests session={session} />
)}
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminPage.tsx
git commit -m "feat: add tab row to AdminPage (dashboard / feature requests)"
git push
```

---

### Task 4: AdminPage — `AdminFeatureRequests` component (read + status change)

**Files:**
- Modify: `src/pages/AdminPage.tsx`

- [ ] **Step 1: Add the `AdminFeatureRequest` type near the top of the file (after other interfaces)**

```ts
interface AdminFeatureRequest {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  description: string;
  status: 'requested' | 'planned' | 'in_progress' | 'completed';
  tags: string[];
  created_at: string;
  vote_count: number;
}
```

- [ ] **Step 2: Add status config constants (after the existing `STATUS_COLORS` map)**

```ts
const FR_STATUS_OPTIONS: { value: AdminFeatureRequest['status']; label: string; color: string }[] = [
  { value: 'requested',   label: 'Requested',   color: '#FFD528' },
  { value: 'planned',     label: 'Planned',     color: '#60a5fa' },
  { value: 'in_progress', label: 'In Progress', color: '#f97316' },
  { value: 'completed',   label: 'Completed',   color: '#4ade80' },
];

const FEATURE_TAGS = [
  'General', 'Bug Report', 'Calculator', 'Invoices', 'AI Input', 'Jobs',
  'Integrations', 'Equipment', 'Expenses', 'Mobile', 'Settings',
  'Custom Rates', 'PDF / Export', 'Performance',
];
```

- [ ] **Step 3: Add `frReloadRef`, `frLoading`, and `loadAdminFeatureRequests` inside `AdminPage()`**

Add these inside `AdminPage()` near the other state declarations:

```ts
const frReloadRef = useRef<(() => void) | null>(null);
const [frLoading, setFrLoading] = useState(false);
function loadAdminFeatureRequests() {
  frReloadRef.current?.();
}
```

- [ ] **Step 4: Create the `AdminFeatureRequests` component**

Add this component above the `export function AdminPage()` declaration:

```tsx
function AdminFeatureRequests({
  reloadRef,
  onLoadingChange,
}: {
  reloadRef: React.MutableRefObject<(() => void) | null>;
  onLoadingChange: (v: boolean) => void;
}) {
  const [requests, setRequests] = useState<AdminFeatureRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState<AdminFeatureRequest['status']>('requested');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTags, setNewTags] = useState<string[]>([]);
  const [newStatus, setNewStatus] = useState<AdminFeatureRequest['status']>('requested');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    onLoadingChange(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('feature_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) { setError(err.message); setLoading(false); onLoadingChange(false); return; }
    const { data: votes } = await supabase
      .from('feature_request_votes')
      .select('feature_request_id');
    const countMap: Record<string, number> = {};
    votes?.forEach(v => { countMap[v.feature_request_id] = (countMap[v.feature_request_id] || 0) + 1; });
    setRequests((data ?? []).map(r => ({ ...r, vote_count: countMap[r.id] || 0 })));
    setLoading(false);
    onLoadingChange(false);
  };

  useEffect(() => {
    reloadRef.current = load;
    load();
  }, []);

  const handleStatusChange = async (id: string, status: AdminFeatureRequest['status']) => {
    await supabase.from('feature_requests').update({ status }).eq('id', id);
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const startEdit = (r: AdminFeatureRequest) => {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditDescription(r.description);
    setEditTags(r.tags ?? []);
    setEditStatus(r.status);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    const { error: err } = await supabase
      .from('feature_requests')
      .update({ title: editTitle.trim(), description: editDescription.trim(), tags: editTags, status: editStatus })
      .eq('id', editingId);
    if (!err) {
      setRequests(prev => prev.map(r => r.id === editingId
        ? { ...r, title: editTitle.trim(), description: editDescription.trim(), tags: editTags, status: editStatus }
        : r));
      setEditingId(null);
    }
    setSaving(false);
  };

  const confirmDelete = async (id: string) => {
    await supabase.from('feature_request_votes').delete().eq('feature_request_id', id);
    await supabase.from('feature_requests').delete().eq('id', id);
    setDeletingId(null);
    setRequests(prev => prev.filter(r => r.id !== id));
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    const { data, error: err } = await supabase
      .from('feature_requests')
      .insert({ title: newTitle.trim(), description: newDescription.trim(), tags: newTags, status: newStatus, user_id: 'admin', user_name: 'Admin' })
      .select()
      .single();
    if (!err && data) {
      setRequests(prev => [{ ...data, vote_count: 0 }, ...prev]);
      setNewTitle(''); setNewDescription(''); setNewTags([]); setNewStatus('requested');
      setShowCreate(false);
    }
    setCreating(false);
  };

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between mt-4 mb-2">
        <h2 className="text-sm font-bold text-white/50 font-mono uppercase tracking-widest">Feature Requests</h2>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-mono transition-all"
        >
          {showCreate ? 'Cancel' : '+ New'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-[#FFD528]/20 space-y-3">
          <input
            className="w-full bg-[#1F1F21] text-white text-sm font-mono rounded-xl px-3 py-2 border border-white/10 placeholder:text-white/25 focus:outline-none focus:border-[#FFD528]/40"
            placeholder="Title"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
          />
          <textarea
            className="w-full bg-[#1F1F21] text-white text-sm font-mono rounded-xl px-3 py-2 border border-white/10 placeholder:text-white/25 focus:outline-none focus:border-[#FFD528]/40 resize-none"
            placeholder="Description (optional)"
            rows={2}
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            {FEATURE_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setNewTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-all ${newTags.includes(tag) ? 'bg-[#FFD528]/20 text-[#FFD528] border border-[#FFD528]/30' : 'bg-white/5 text-white/40 border border-white/10 hover:text-white/60'}`}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value as AdminFeatureRequest['status'])}
              className="bg-[#1F1F21] text-white text-xs font-mono rounded-xl px-3 py-2 border border-white/10 focus:outline-none focus:border-[#FFD528]/40"
            >
              {FR_STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              className="px-4 py-1.5 rounded-xl bg-[#FFD528] text-[#1F1F21] text-xs font-bold font-mono transition-all disabled:opacity-40 hover:bg-[#FFD528]/90"
            >
              {creating ? 'Saving…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Loading / error */}
      {loading && (
        <div className="text-white/30 text-sm font-mono text-center py-8">Loading…</div>
      )}
      {error && (
        <div className="bg-[#D45B5B]/10 border border-[#D45B5B]/25 rounded-2xl p-4 text-[#D45B5B] text-sm font-mono">
          Error: {error}
        </div>
      )}

      {/* Request list */}
      {!loading && requests.length === 0 && !error && (
        <div className="text-white/30 text-sm font-mono text-center py-8">No feature requests yet.</div>
      )}

      <div className="space-y-2">
        {requests.map(r => (
          <div key={r.id} className="bg-[#2a2a2c] rounded-2xl border border-white/5 overflow-hidden">
            {/* Row */}
            <div className="flex items-start gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white font-mono truncate">{r.title}</span>
                  {(r.tags ?? []).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-white/5 text-white/40">{tag}</span>
                  ))}
                </div>
                {r.description && (
                  <p className="text-xs text-white/40 font-mono mt-0.5 truncate">{r.description}</p>
                )}
                <p className="text-[10px] text-white/25 font-mono mt-1">
                  {new Date(r.created_at).toLocaleDateString('en-GB')} · {r.vote_count} vote{r.vote_count !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Status dropdown */}
                <select
                  value={r.status}
                  onChange={e => handleStatusChange(r.id, e.target.value as AdminFeatureRequest['status'])}
                  className="bg-transparent text-[11px] font-mono rounded-lg px-2 py-1 border border-white/10 focus:outline-none cursor-pointer"
                  style={{ color: FR_STATUS_OPTIONS.find(s => s.value === r.status)?.color ?? '#fff' }}
                >
                  {FR_STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value} style={{ background: '#1F1F21', color: s.color }}>{s.label}</option>
                  ))}
                </select>
                {/* Edit */}
                <button
                  onClick={() => editingId === r.id ? cancelEdit() : startEdit(r)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                {/* Delete */}
                {deletingId === r.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => confirmDelete(r.id)} className="px-2 py-1 rounded-lg bg-[#D45B5B]/20 text-[#D45B5B] text-[10px] font-mono hover:bg-[#D45B5B]/30 transition-all">Confirm</button>
                    <button onClick={() => setDeletingId(null)} className="px-2 py-1 rounded-lg bg-white/5 text-white/40 text-[10px] font-mono hover:bg-white/10 transition-all">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeletingId(r.id)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-[#D45B5B]/15 text-white/40 hover:text-[#D45B5B] transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                )}
              </div>
            </div>

            {/* Inline edit expand */}
            {editingId === r.id && (
              <div className="border-t border-white/5 p-4 space-y-3">
                <input
                  className="w-full bg-[#1F1F21] text-white text-sm font-mono rounded-xl px-3 py-2 border border-white/10 placeholder:text-white/25 focus:outline-none focus:border-[#FFD528]/40"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                />
                <textarea
                  className="w-full bg-[#1F1F21] text-white text-sm font-mono rounded-xl px-3 py-2 border border-white/10 placeholder:text-white/25 focus:outline-none focus:border-[#FFD528]/40 resize-none"
                  rows={2}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {FEATURE_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setEditTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-all ${editTags.includes(tag) ? 'bg-[#FFD528]/20 text-[#FFD528] border border-[#FFD528]/30' : 'bg-white/5 text-white/40 border border-white/10 hover:text-white/60'}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as AdminFeatureRequest['status'])}
                    className="bg-[#1F1F21] text-white text-xs font-mono rounded-xl px-3 py-2 border border-white/10 focus:outline-none focus:border-[#FFD528]/40"
                  >
                    {FR_STATUS_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={saveEdit}
                    disabled={saving || !editTitle.trim()}
                    className="px-4 py-1.5 rounded-xl bg-[#FFD528] text-[#1F1F21] text-xs font-bold font-mono transition-all disabled:opacity-40 hover:bg-[#FFD528]/90"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={cancelEdit} className="px-3 py-1.5 rounded-xl bg-white/5 text-white/40 text-xs font-mono hover:bg-white/10 transition-all">Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add the `AdminFeatureRequests` JSX to the tab conditional in `AdminPage`**

In the JSX where you added `{adminTab === 'feature-requests' && ...}` in Task 3 Step 5, replace it with:

```tsx
{adminTab === 'feature-requests' && (
  <AdminFeatureRequests reloadRef={frReloadRef} onLoadingChange={setFrLoading} />
)}
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminPage.tsx
git commit -m "feat: add feature requests CRUD tab to admin dashboard"
git push
```

---

### Task 5: Smoke test in production

- [ ] **Step 1: Open `app.crewdock.app/admin` in the browser**

Verify:
- Tab row appears: "Dashboard" and "Feature Requests"
- Dashboard tab shows existing analytics (unchanged)
- Feature Requests tab shows the list of existing requests
- Status badges are colour-coded correctly (no `submitted` rows — should all say `requested`)

- [ ] **Step 2: Test status change**

Click the status dropdown on a request → change it → reload the page → confirm the new status persisted.

- [ ] **Step 3: Test create**

Click `+ New` → fill in title → set a status → click Create → confirm the new request appears at the top of the list.

- [ ] **Step 4: Test edit**

Click the edit icon on any row → modify title → Save → confirm the updated title shows without a page reload.

- [ ] **Step 5: Test delete**

Click the delete icon → confirm the "Confirm / Cancel" inline prompt appears → click Confirm → confirm the row disappears.

- [ ] **Step 6: Verify SupportPage**

Open `app.crewdock.app/support` → Feature Requests section → confirm requests that were `submitted` now show "Requested" badge.
