# Admin Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private admin analytics dashboard at `/admin`, visible only to `milo.cosemans@gmail.com`, backed by a Supabase Edge Function that bypasses RLS to aggregate platform-wide stats.

**Architecture:** A Supabase Edge Function (`admin-stats`) validates the caller's JWT, checks the email matches the admin address, then queries all tables using the service role key and returns aggregated JSON. The React frontend calls this function via `supabase.functions.invoke()` and renders stat cards + Recharts charts. The nav item and route are gated by email check so no other user can access or even see the link.

**Tech Stack:** React 19, TypeScript, Recharts (new), Supabase Edge Functions (Deno), `@supabase/supabase-js`, date-fns, Tailwind CSS, lucide-react, shadcn UI cards.

**Supabase project ref:** `dmqkmkzsveyvpwugxwym`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `supabase/functions/admin-stats/index.ts` | Edge function: auth check + data aggregation |
| Create | `src/pages/AdminPage.tsx` | Admin dashboard UI with stat cards + charts |
| Modify | `src/components/AppLayout.tsx` | Add admin nav item above Settings (admin only) |
| Modify | `src/App.tsx` | Add `/admin` route with admin email guard |

---

## Task 1: Install Recharts

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install Recharts**

```bash
cd /Users/milocosemans/Git/apa-crew-calc && npm install recharts
```

Expected output: `added N packages`

- [ ] **Step 2: Verify it appears in package.json**

```bash
grep recharts package.json
```

Expected: `"recharts": "^2.x.x"`

---

## Task 2: Create the Supabase Edge Function

**Files:**
- Create: `supabase/functions/admin-stats/index.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p /Users/milocosemans/Git/apa-crew-calc/supabase/functions/admin-stats
```

- [ ] **Step 2: Write the edge function**

Create `supabase/functions/admin-stats/index.ts`:

```typescript
// supabase/functions/admin-stats/index.ts
// Admin-only edge function — validates caller is milo.cosemans@gmail.com,
// then uses service role to query all tables and return aggregated stats.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_EMAIL = 'milo.cosemans@gmail.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify the caller is the admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Use anon client to verify the JWT
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user: callerUser }, error: authError } = await anonClient.auth.getUser()
    if (authError || !callerUser || callerUser.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Service role client — bypasses RLS
    const db = createClient(supabaseUrl, serviceRoleKey)

    // ── Fetch all data in parallel ──────────────────────────────────────────
    const [
      usersResult,
      subscriptionsResult,
      projectsResult,
      projectDaysResult,
      userSettingsResult,
      bookkeepingResult,
      customRolesResult,
      equipmentResult,
      featureRequestsResult,
      favouriteRolesResult,
      sharedJobsResult,
    ] = await Promise.all([
      db.auth.admin.listUsers({ perPage: 1000, page: 1 }),
      db.from('subscriptions').select('user_id, status, trial_ends_at, trial_extended, created_at'),
      db.from('projects').select('id, user_id, status, created_at'),
      db.from('project_days').select('id, project_id, grand_total, role_name, day_type, work_date'),
      db.from('user_settings').select('user_id, department'),
      db.from('bookkeeping_connections').select('user_id, platform'),
      db.from('custom_roles').select('user_id'),
      db.from('equipment_packages').select('user_id'),
      db.from('feature_requests').select('category, created_at'),
      db.from('favourite_roles').select('user_id'),
      db.from('shared_jobs').select('id'),
    ])

    const users = usersResult.data?.users ?? []
    const subscriptions = subscriptionsResult.data ?? []
    const projects = projectsResult.data ?? []
    const projectDays = projectDaysResult.data ?? []
    const userSettings = userSettingsResult.data ?? []
    const bookkeepingConns = bookkeepingResult.data ?? []
    const customRoles = customRolesResult.data ?? []
    const equipmentPkgs = equipmentResult.data ?? []
    const featureRequests = featureRequestsResult.data ?? []
    const favouriteRoles = favouriteRolesResult.data ?? []
    const sharedJobs = sharedJobsResult.data ?? []

    const now = new Date()

    // ── Helper: get last 12 month labels ───────────────────────────────────
    function last12MonthLabels(): string[] {
      const labels: string[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
      return labels
    }

    function bucketByMonth(dates: string[]): { month: string; count: number }[] {
      const months = last12MonthLabels()
      const counts: Record<string, number> = {}
      months.forEach(m => { counts[m] = 0 })
      dates.forEach(d => {
        const key = d.slice(0, 7) // "YYYY-MM"
        if (key in counts) counts[key]++
      })
      return months.map(m => ({ month: m, count: counts[m] }))
    }

    function countSince(dates: string[], days: number): number {
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      return dates.filter(d => new Date(d) >= cutoff).length
    }

    // ── Users ───────────────────────────────────────────────────────────────
    const userCreatedDates = users.map(u => u.created_at)
    const activeLastMonth = users.filter(u =>
      u.last_sign_in_at && new Date(u.last_sign_in_at) >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    ).length

    const departmentCounts: Record<string, number> = {}
    userSettings.forEach(s => {
      const dep = s.department || 'Unknown'
      departmentCounts[dep] = (departmentCounts[dep] ?? 0) + 1
    })
    const byDepartment = Object.entries(departmentCounts)
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count)

    // ── Subscriptions ───────────────────────────────────────────────────────
    let trialing = 0, free = 0, active = 0, lifetime = 0, pastDue = 0, canceled = 0, trialExtended = 0

    subscriptions.forEach(s => {
      if (s.status === 'trialing') {
        const trialEnd = new Date(s.trial_ends_at)
        if (trialEnd >= now) {
          trialing++
        } else {
          free++ // trial expired, never converted
        }
      } else if (s.status === 'active') {
        active++
      } else if (s.status === 'lifetime') {
        lifetime++
      } else if (s.status === 'past_due' || s.status === 'unpaid') {
        pastDue++
      } else if (s.status === 'canceled') {
        canceled++
      }
      if (s.trial_extended) trialExtended++
    })

    const paidUsers = active + lifetime
    const everConverted = subscriptions.filter(s => s.status === 'active' || s.status === 'lifetime' || s.status === 'past_due' || s.status === 'canceled').length
    const conversionRate = users.length > 0 ? Math.round((everConverted / users.length) * 100) : 0

    // ── Projects ────────────────────────────────────────────────────────────
    const statusCounts: Record<string, number> = {}
    projects.forEach(p => {
      statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1
    })
    const byStatus = Object.entries(statusCounts)
      .map(([status, count]) => ({ status, count }))

    const projectCreatedDates = projects.map(p => p.created_at)
    const avgJobsPerUser = users.length > 0 ? Math.round((projects.length / users.length) * 10) / 10 : 0

    // ── Project Days ────────────────────────────────────────────────────────
    const totalValue = projectDays.reduce((sum, d) => sum + (d.grand_total ?? 0), 0)
    const daysWithRate = projectDays.filter(d => d.grand_total > 0)
    const avgRate = daysWithRate.length > 0
      ? Math.round(totalValue / daysWithRate.length)
      : 0

    const dayTypeCounts: Record<string, number> = {}
    projectDays.forEach(d => {
      const t = d.day_type || 'unknown'
      dayTypeCounts[t] = (dayTypeCounts[t] ?? 0) + 1
    })
    const byDayType = Object.entries(dayTypeCounts)
      .map(([dayType, count]) => ({ dayType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const roleCounts: Record<string, number> = {}
    projectDays.forEach(d => {
      if (d.role_name) {
        roleCounts[d.role_name] = (roleCounts[d.role_name] ?? 0) + 1
      }
    })
    const topRoles = Object.entries(roleCounts)
      .map(([roleName, count]) => ({ roleName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const dayWorkDates = projectDays.map(d => d.work_date)

    // ── Feature Adoption ────────────────────────────────────────────────────
    const usersWithBookkeeping = new Set(bookkeepingConns.map(b => b.user_id)).size
    const xeroUsers = new Set(bookkeepingConns.filter(b => b.platform === 'xero').map(b => b.user_id)).size
    const qbUsers = new Set(bookkeepingConns.filter(b => b.platform === 'quickbooks').map(b => b.user_id)).size
    const faUsers = new Set(bookkeepingConns.filter(b => b.platform === 'freeagent').map(b => b.user_id)).size
    const usersWithCustomRoles = new Set(customRoles.map(r => r.user_id)).size
    const usersWithEquipment = new Set(equipmentPkgs.map(e => e.user_id)).size
    const usersWithFavourites = new Set(favouriteRoles.map(f => f.user_id)).size

    const featureCategoryCounts: Record<string, number> = {}
    featureRequests.forEach(f => {
      const cat = f.category || 'Other'
      featureCategoryCounts[cat] = (featureCategoryCounts[cat] ?? 0) + 1
    })
    const featureRequestsByCategory = Object.entries(featureCategoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)

    // ── Build response ──────────────────────────────────────────────────────
    const stats = {
      users: {
        total: users.length,
        last7Days: countSince(userCreatedDates, 7),
        last30Days: countSince(userCreatedDates, 30),
        byMonth: bucketByMonth(userCreatedDates),
        activeLastMonth,
        byDepartment,
      },
      subscriptions: {
        trialing,
        free,
        active,
        lifetime,
        pastDue,
        canceled,
        trialExtended,
        conversionRate,
        paidUsers,
      },
      jobs: {
        total: projects.length,
        last30Days: countSince(projectCreatedDates, 30),
        byStatus,
        byMonth: bucketByMonth(projectCreatedDates),
        avgPerUser: avgJobsPerUser,
      },
      days: {
        total: projectDays.length,
        last30Days: countSince(dayWorkDates, 30),
        byMonth: bucketByMonth(dayWorkDates),
        totalValue: Math.round(totalValue),
        avgRate,
        byDayType,
        topRoles,
      },
      features: {
        bookkeeping: {
          total: usersWithBookkeeping,
          xero: xeroUsers,
          quickbooks: qbUsers,
          freeagent: faUsers,
        },
        customRoles: usersWithCustomRoles,
        equipmentPackages: usersWithEquipment,
        favouriteRoles: usersWithFavourites,
        sharedJobsTotal: sharedJobs.length,
        featureRequests: featureRequests.length,
        featureRequestsByCategory,
      },
    }

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('[admin-stats] error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

---

## Task 3: Deploy the Edge Function

**Files:**
- (no file changes — deployment step)

- [ ] **Step 1: Log in to Supabase CLI (if needed)**

```bash
supabase login
```

If already logged in, this will confirm it. If not, follow the browser prompt.

- [ ] **Step 2: Deploy the edge function**

```bash
cd /Users/milocosemans/Git/apa-crew-calc && supabase functions deploy admin-stats --project-ref dmqkmkzsveyvpwugxwym
```

Expected output:
```
Deploying Function admin-stats (script size: ...kb)
Deployed Function admin-stats on project dmqkmkzsveyvpwugxwym
```

- [ ] **Step 3: Verify it appears in the Supabase dashboard**

Function should now be visible at: `https://supabase.com/dashboard/project/dmqkmkzsveyvpwugxwym/functions`

---

## Task 4: Create the AdminPage React component

**Files:**
- Create: `src/pages/AdminPage.tsx`

- [ ] **Step 1: Create the admin page**

Create `src/pages/AdminPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import { Users, Briefcase, CalendarDays, PoundSterling, TrendingUp, Zap, RefreshCw, BarChart2 } from 'lucide-react';

const ADMIN_EMAIL = 'milo.cosemans@gmail.com';

const YELLOW = '#FFD528';
const CHARCOAL = '#1F1F21';

const PIE_COLORS: Record<string, string> = {
  trialing: '#FFD528',
  free: '#6b7280',
  active: '#4ade80',
  lifetime: '#c084fc',
  pastDue: '#f97316',
  canceled: '#D45B5B',
};

const STATUS_COLORS: Record<string, string> = {
  ongoing: '#60a5fa',
  finished: '#4ade80',
  invoiced: '#FFD528',
  paid: '#c084fc',
};

// Format month key "YYYY-MM" to "Jan", "Feb" etc.
function shortMonth(key: string): string {
  const [year, month] = key.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleString('default', { month: 'short' });
}

function formatGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

interface AdminStats {
  users: {
    total: number;
    last7Days: number;
    last30Days: number;
    byMonth: { month: string; count: number }[];
    activeLastMonth: number;
    byDepartment: { department: string; count: number }[];
  };
  subscriptions: {
    trialing: number;
    free: number;
    active: number;
    lifetime: number;
    pastDue: number;
    canceled: number;
    trialExtended: number;
    conversionRate: number;
    paidUsers: number;
  };
  jobs: {
    total: number;
    last30Days: number;
    byStatus: { status: string; count: number }[];
    byMonth: { month: string; count: number }[];
    avgPerUser: number;
  };
  days: {
    total: number;
    last30Days: number;
    byMonth: { month: string; count: number }[];
    totalValue: number;
    avgRate: number;
    byDayType: { dayType: string; count: number }[];
    topRoles: { roleName: string; count: number }[];
  };
  features: {
    bookkeeping: { total: number; xero: number; quickbooks: number; freeagent: number };
    customRoles: number;
    equipmentPackages: number;
    favouriteRoles: number;
    sharedJobsTotal: number;
    featureRequests: number;
    featureRequestsByCategory: { category: string; count: number }[];
  };
}

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#2a2a2c] rounded-2xl p-4 flex flex-col gap-2 border border-white/5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40 font-mono uppercase tracking-wider">{label}</span>
        <div className={`h-7 w-7 rounded-xl flex items-center justify-center ${accent ? 'bg-[#FFD528]/15' : 'bg-white/5'}`}>
          <Icon className={`h-3.5 w-3.5 ${accent ? 'text-[#FFD528]' : 'text-white/40'}`} />
        </div>
      </div>
      <span className={`text-2xl font-bold font-mono ${accent ? 'text-[#FFD528]' : 'text-white'}`}>{value}</span>
      {sub && <span className="text-[11px] text-white/30">{sub}</span>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-white/50 font-mono uppercase tracking-widest mb-3 mt-6">{children}</h2>
  );
}

export function AdminPage() {
  usePageTitle('Admin');
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Gate — redirect non-admins immediately
  useEffect(() => {
    if (user && user.email !== ADMIN_EMAIL) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  async function fetchStats() {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-stats', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (fnError) throw new Error(fnError.message);
      setStats(data as AdminStats);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session && user?.email === ADMIN_EMAIL) {
      fetchStats();
    }
  }, [session]);

  if (!user || user.email !== ADMIN_EMAIL) return null;

  return (
    <div className="space-y-2 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white font-mono flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-[#FFD528]" />
            Admin Dashboard
          </h1>
          <p className="text-xs text-white/30 mt-0.5">Platform analytics — visible only to you</p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-mono transition-all disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && !stats && (
        <div className="flex items-center justify-center py-24 text-white/30 text-sm font-mono">
          Loading stats…
        </div>
      )}

      {error && (
        <div className="bg-[#D45B5B]/10 border border-[#D45B5B]/25 rounded-2xl p-4 text-[#D45B5B] text-sm font-mono">
          Error: {error}
        </div>
      )}

      {stats && (
        <>
          {/* ── Key Numbers ─────────────────────────────────────────────── */}
          <SectionTitle>Overview</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Users" value={stats.users.total} sub={`+${stats.users.last30Days} this month`} icon={Users} accent />
            <StatCard label="Pro + Lifetime" value={stats.subscriptions.paidUsers} sub={`${stats.subscriptions.conversionRate}% conversion`} icon={Zap} accent />
            <StatCard label="Total Jobs" value={stats.jobs.total} sub={`avg ${stats.jobs.avgPerUser} per user`} icon={Briefcase} />
            <StatCard label="Days Logged" value={stats.days.total.toLocaleString()} sub={`+${stats.days.last30Days} last 30d`} icon={CalendarDays} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <StatCard label="Total Value Calc'd" value={formatGBP(stats.days.totalValue)} sub="across all users" icon={PoundSterling} accent />
            <StatCard label="Avg Day Rate" value={formatGBP(stats.days.avgRate)} sub="per work day" icon={TrendingUp} />
            <StatCard label="Active (30d)" value={stats.users.activeLastMonth} sub="users signed in" icon={Users} />
            <StatCard label="On Trial" value={stats.subscriptions.trialing} sub={`${stats.subscriptions.trialExtended} extended`} icon={Zap} />
          </div>

          {/* ── User Growth ─────────────────────────────────────────────── */}
          <SectionTitle>User Growth — Last 12 Months</SectionTitle>
          <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.users.byMonth.map(d => ({ ...d, month: shortMonth(d.month) }))}>
                <defs>
                  <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={YELLOW} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={YELLOW} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={24} />
                <Tooltip contentStyle={{ background: CHARCOAL, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontFamily: 'monospace', fontSize: 12 }} labelStyle={{ color: 'rgba(255,255,255,0.6)' }} itemStyle={{ color: YELLOW }} />
                <Area type="monotone" dataKey="count" stroke={YELLOW} strokeWidth={2} fill="url(#userGrad)" name="New users" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ── Subscriptions ───────────────────────────────────────────── */}
          <SectionTitle>Subscription Breakdown</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Pie chart */}
            <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Trial (active)', value: stats.subscriptions.trialing, key: 'trialing' },
                      { name: 'Free (expired)', value: stats.subscriptions.free, key: 'free' },
                      { name: 'Pro', value: stats.subscriptions.active, key: 'active' },
                      { name: 'Lifetime', value: stats.subscriptions.lifetime, key: 'lifetime' },
                      { name: 'At Risk', value: stats.subscriptions.pastDue, key: 'pastDue' },
                      { name: 'Churned', value: stats.subscriptions.canceled, key: 'canceled' },
                    ].filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {[
                      { key: 'trialing' }, { key: 'free' }, { key: 'active' },
                      { key: 'lifetime' }, { key: 'pastDue' }, { key: 'canceled' }
                    ].filter((_, i) => {
                      const vals = [stats.subscriptions.trialing, stats.subscriptions.free, stats.subscriptions.active, stats.subscriptions.lifetime, stats.subscriptions.pastDue, stats.subscriptions.canceled];
                      return vals[i] > 0;
                    }).map((entry) => (
                      <Cell key={entry.key} fill={PIE_COLORS[entry.key]} />
                    ))}
                  </Pie>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }} />
                  <Tooltip contentStyle={{ background: CHARCOAL, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontFamily: 'monospace', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Subscription stat cards */}
            <div className="grid grid-cols-2 gap-2 content-start">
              {[
                { label: 'Trial (active)', value: stats.subscriptions.trialing, color: '#FFD528' },
                { label: 'Free (expired)', value: stats.subscriptions.free, color: '#6b7280' },
                { label: 'Pro', value: stats.subscriptions.active, color: '#4ade80' },
                { label: 'Lifetime', value: stats.subscriptions.lifetime, color: '#c084fc' },
                { label: 'At Risk', value: stats.subscriptions.pastDue, color: '#f97316' },
                { label: 'Churned', value: stats.subscriptions.canceled, color: '#D45B5B' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[#1F1F21] rounded-xl p-3 border border-white/5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="h-2 w-2 rounded-full" style={{ background: color }} />
                    <span className="text-[10px] text-white/40 font-mono uppercase">{label}</span>
                  </div>
                  <span className="text-lg font-bold font-mono text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Jobs by month ───────────────────────────────────────────── */}
          <SectionTitle>Jobs Created — Last 12 Months</SectionTitle>
          <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.jobs.byMonth.map(d => ({ ...d, month: shortMonth(d.month) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={24} />
                <Tooltip contentStyle={{ background: CHARCOAL, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontFamily: 'monospace', fontSize: 12 }} labelStyle={{ color: 'rgba(255,255,255,0.6)' }} itemStyle={{ color: '#60a5fa' }} />
                <Bar dataKey="count" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Jobs" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Jobs by Status + Days by month ─────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <SectionTitle>Jobs by Status</SectionTitle>
              <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.jobs.byStatus} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="status" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={65} />
                    <Tooltip contentStyle={{ background: CHARCOAL, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontFamily: 'monospace', fontSize: 12 }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Jobs">
                      {stats.jobs.byStatus.map(entry => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#60a5fa'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <SectionTitle>Days Logged — Last 12 Months</SectionTitle>
              <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.days.byMonth.map(d => ({ ...d, month: shortMonth(d.month) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip contentStyle={{ background: CHARCOAL, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontFamily: 'monospace', fontSize: 12 }} labelStyle={{ color: 'rgba(255,255,255,0.6)' }} itemStyle={{ color: '#4ade80' }} />
                    <Bar dataKey="count" fill="#4ade80" radius={[4, 4, 0, 0]} name="Days" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── Department breakdown ────────────────────────────────────── */}
          <SectionTitle>Users by Department</SectionTitle>
          <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.users.byDepartment} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="department" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={100} />
                <Tooltip contentStyle={{ background: CHARCOAL, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontFamily: 'monospace', fontSize: 12 }} itemStyle={{ color: YELLOW }} />
                <Bar dataKey="count" fill={YELLOW} radius={[0, 4, 4, 0]} name="Users" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Day types + Top roles ───────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <SectionTitle>Most Used Day Types</SectionTitle>
              <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats.days.byDayType} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="dayType" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip contentStyle={{ background: CHARCOAL, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontFamily: 'monospace', fontSize: 12 }} itemStyle={{ color: '#c084fc' }} />
                    <Bar dataKey="count" fill="#c084fc" radius={[0, 4, 4, 0]} name="Days" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <SectionTitle>Top 10 Roles</SectionTitle>
              <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats.days.topRoles} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="roleName" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={120} />
                    <Tooltip contentStyle={{ background: CHARCOAL, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontFamily: 'monospace', fontSize: 12 }} itemStyle={{ color: '#f97316' }} />
                    <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} name="Days" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── Feature Adoption ────────────────────────────────────────── */}
          <SectionTitle>Feature Adoption</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Bookkeeping Integrations', value: stats.features.bookkeeping.total, sub: `Xero: ${stats.features.bookkeeping.xero} · QB: ${stats.features.bookkeeping.quickbooks} · FA: ${stats.features.bookkeeping.freeagent}` },
              { label: 'Custom Roles Created', value: stats.features.customRoles, sub: 'users with ≥1 custom role' },
              { label: 'Equipment Packages', value: stats.features.equipmentPackages, sub: 'users with ≥1 package' },
              { label: 'Favourite Roles', value: stats.features.favouriteRoles, sub: 'users with favourites set' },
              { label: 'Shared Job Links', value: stats.features.sharedJobsTotal, sub: 'total links created' },
              { label: 'Feature Requests', value: stats.features.featureRequests, sub: 'total submitted' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
                <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider block mb-1">{label}</span>
                <span className="text-2xl font-bold font-mono text-white">{value}</span>
                <span className="text-[11px] text-white/30 block mt-1">{sub}</span>
              </div>
            ))}
          </div>

          {/* ── Feature Requests by Category ───────────────────────────── */}
          {stats.features.featureRequestsByCategory.length > 0 && (
            <>
              <SectionTitle>Feature Requests by Category</SectionTitle>
              <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5 space-y-2">
                {stats.features.featureRequestsByCategory.map(({ category, count }) => (
                  <div key={category} className="flex items-center gap-3">
                    <span className="text-sm font-mono text-white/60 w-40 shrink-0 truncate">{category}</span>
                    <div className="flex-1 bg-white/5 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-[#FFD528]"
                        style={{ width: `${Math.min(100, (count / stats.features.featureRequests) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono text-white/40 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
```

---

## Task 5: Add admin nav item and route

**Files:**
- Modify: `src/components/AppLayout.tsx:1` and `:114-131`
- Modify: `src/App.tsx:14` and `:60-75`

### 5a — AppLayout.tsx: import BarChart2 and add admin nav item

- [ ] **Step 1: Add BarChart2 to lucide-react import**

In `src/components/AppLayout.tsx`, change line 2 from:
```tsx
import { Calculator, FileText, LogOut, Sparkles, Menu, X, LayoutDashboard, Settings, User, ChevronLeft, ChevronRight, FolderOpen, LifeBuoy } from 'lucide-react';
```
to:
```tsx
import { Calculator, FileText, LogOut, Sparkles, Menu, X, LayoutDashboard, Settings, User, ChevronLeft, ChevronRight, FolderOpen, LifeBuoy, BarChart2 } from 'lucide-react';
```

- [ ] **Step 2: Add admin item above Settings in the desktop sidebar**

In `src/components/AppLayout.tsx`, find the "Bottom: Settings + User" section. The current Settings link block starts at line ~115:
```tsx
        {/* Bottom: Settings + User */}
        <div className="px-3 py-3 space-y-1">
          <Link to="/settings">
```

Replace it with:
```tsx
        {/* Bottom: Admin (admin-only) + Settings + User */}
        <div className="px-3 py-3 space-y-1">
          {user?.email === 'milo.cosemans@gmail.com' && (
            <Link to="/admin">
              <div
                className={cn(
                  "flex items-center h-11 rounded-2xl transition-all duration-200 cursor-pointer",
                  sidebarExpanded ? "gap-3 px-3 justify-start" : "justify-center px-0",
                  location.pathname === '/admin'
                    ? "bg-[#FFD528] text-[#1F1F21]"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                )}
              >
                <BarChart2 className="h-5 w-5 shrink-0" />
                {sidebarExpanded && (
                  <span className="text-sm font-medium whitespace-nowrap font-mono">Admin</span>
                )}
              </div>
            </Link>
          )}
          <Link to="/settings">
```

- [ ] **Step 3: Add admin item to mobile dropdown**

In `src/components/AppLayout.tsx`, find the mobile dropdown Settings link (around line 255):
```tsx
              <div className="border-t border-white/10 mt-1 pt-1">
                <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>
```

Replace it with:
```tsx
              <div className="border-t border-white/10 mt-1 pt-1">
                {user?.email === 'milo.cosemans@gmail.com' && (
                  <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>
                    <div className={cn(
                      "flex items-center gap-3 h-11 px-3 rounded-xl transition-all",
                      location.pathname === '/admin'
                        ? "bg-[#FFD528] text-[#1F1F21] font-semibold"
                        : "text-white/60 hover:text-white hover:bg-white/10"
                    )}>
                      <BarChart2 className="h-4 w-4" />
                      <span className="text-sm font-medium">Admin</span>
                    </div>
                  </Link>
                )}
                <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>
```

### 5b — App.tsx: import AdminPage and add route

- [ ] **Step 4: Import AdminPage in App.tsx**

In `src/App.tsx`, after the SupportPage import (line 14), add:
```tsx
import { AdminPage } from '@/pages/AdminPage';
```

- [ ] **Step 5: Add admin route inside the protected AppLayout routes**

In `src/App.tsx`, after the `/settings` route:
```tsx
                <Route path="/settings" element={<SettingsPage />} />
```

Add:
```tsx
                <Route path="/admin" element={<AdminPage />} />
```

---

## Task 6: Commit and push

- [ ] **Step 1: Stage and commit**

```bash
cd /Users/milocosemans/Git/apa-crew-calc && git add \
  supabase/functions/admin-stats/index.ts \
  src/pages/AdminPage.tsx \
  src/components/AppLayout.tsx \
  src/App.tsx \
  package.json \
  package-lock.json
git commit -m "feat: add admin analytics dashboard via Supabase edge function"
```

- [ ] **Step 2: Push to trigger Vercel deploy**

```bash
git push
```

- [ ] **Step 3: Verify in production**

1. Open `app.crewdock.app` and sign in as `milo.cosemans@gmail.com`
2. Confirm "Admin" nav item appears above Settings
3. Click Admin — confirm stats load and charts render
4. Sign in as a different account — confirm Admin nav item is hidden and `/admin` redirects to `/dashboard`

---

## Self-Review

**Spec coverage:**
- ✅ Total jobs created — `stats.jobs.total`
- ✅ New accounts graph (last 12 months) — Area chart with `byMonth`
- ✅ Free trial / free / pro / lifetime counts — Subscription pie + cards
- ✅ Days logged — `stats.days.total`
- ✅ Department breakdown — horizontal bar chart
- ✅ MRR estimate / paid users — `paidUsers`, `conversionRate`
- ✅ Churn / at-risk — `canceled`, `pastDue`
- ✅ Trial-to-paid conversion — `conversionRate`
- ✅ Trial extension usage — `trialExtended`
- ✅ Active users (30d) — `activeLastMonth`
- ✅ Average jobs per user — `avgPerUser`
- ✅ Total value calculated — `totalValue`, `avgRate`
- ✅ Feature adoption — bookkeeping (per platform), custom roles, equipment, favourites, shared jobs, feature requests
- ✅ Jobs by status — horizontal bar chart
- ✅ Most used day types — horizontal bar chart
- ✅ Top roles — horizontal bar chart
- ✅ Feature requests by category — progress bar list
- ✅ Admin-only: gated by email in edge function, nav item, and route component
- ✅ No Vercel function slots used — Supabase Edge Function

**No placeholders found.**

**Type consistency check:** `AdminStats` interface defined in `AdminPage.tsx` matches the exact field names returned by the edge function. `byMonth`, `byDayType`, `topRoles`, `byDepartment`, `byStatus`, `featureRequestsByCategory`, `bookkeeping` — all consistent across both files.
