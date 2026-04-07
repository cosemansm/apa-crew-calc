import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const resp = await fetch(`${supabaseUrl}/functions/v1/admin-stats`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`);
      setStats(json as AdminStats);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.email === ADMIN_EMAIL && session) {
      fetchStats();
    }
  }, [user, session]);

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
