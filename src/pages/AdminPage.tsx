import { useEffect, useState, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import { Users, Briefcase, CalendarDays, PoundSterling, TrendingUp, Zap, RefreshCw, BarChart2, Lightbulb, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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

// Format month key "YYYY-MM" to "Jan", "Feb" etc.
function shortMonth(key: string): string {
  const [year, month] = key.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleString('default', { month: 'short' });
}

function formatGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

interface UserListEntry {
  user_id: string;
  email: string;
  name: string;
  status: string;
  trial_ends_at: string | null;
  created_at: string;
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
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);
  const [savedStatusId, setSavedStatusId] = useState<string | null>(null);
  const [openCreateStatusMenu, setOpenCreateStatusMenu] = useState(false);
  const [openEditStatusMenu, setOpenEditStatusMenu] = useState(false);

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
    const { error } = await supabase.from('feature_requests').update({ status }).eq('id', id);
    if (!error) {
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
      setSavedStatusId(id);
      setTimeout(() => setSavedStatusId(s => s === id ? null : s), 1500);
    }
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
            <div className="relative">
              <button
                onClick={() => setOpenCreateStatusMenu(v => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#1F1F21] border border-white/10 text-xs font-mono transition-all hover:border-white/20 focus:outline-none"
                style={{ color: FR_STATUS_OPTIONS.find(s => s.value === newStatus)?.color ?? '#fff' }}
              >
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: FR_STATUS_OPTIONS.find(s => s.value === newStatus)?.color }} />
                {FR_STATUS_OPTIONS.find(s => s.value === newStatus)?.label ?? newStatus}
                <ChevronDown className="h-3 w-3 opacity-50 ml-0.5" />
              </button>
              {openCreateStatusMenu && (
                <div className="absolute left-0 top-full mt-1 z-10 bg-[#2a2a2c] border border-white/10 rounded-xl overflow-hidden shadow-xl min-w-[120px]">
                  {FR_STATUS_OPTIONS.map(s => (
                    <button
                      key={s.value}
                      onClick={() => { setNewStatus(s.value); setOpenCreateStatusMenu(false); }}
                      className="w-full text-left px-3 py-2 text-[11px] font-mono hover:bg-white/5 transition-all flex items-center gap-2"
                      style={{ color: s.color }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              className="px-4 py-1.5 rounded-xl bg-[#FFD528] text-[#1F1F21] text-xs font-bold font-mono transition-all disabled:opacity-40 hover:bg-[#FFD528]/90"
            >
              {creating ? 'Saving\u2026' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Loading / error */}
      {loading && (
        <div className="text-white/30 text-sm font-mono text-center py-8">Loading\u2026</div>
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
          <div key={r.id} className="bg-[#2a2a2c] rounded-2xl border border-white/5">
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
                <div className="relative">
                  <button
                    onClick={() => setOpenStatusId(openStatusId === r.id ? null : r.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1F1F21] border text-[11px] font-mono transition-all ${savedStatusId === r.id ? 'border-[#4ade80]/40' : 'border-white/10 hover:border-white/20'}`}
                    style={{ color: savedStatusId === r.id ? '#4ade80' : (FR_STATUS_OPTIONS.find(s => s.value === r.status)?.color ?? '#fff') }}
                  >
                    {savedStatusId === r.id ? 'Saved ✓' : (FR_STATUS_OPTIONS.find(s => s.value === r.status)?.label ?? r.status)}
                    {savedStatusId !== r.id && <ChevronDown className="h-3 w-3 opacity-50" />}
                  </button>
                  {openStatusId === r.id && (
                    <div className="absolute right-0 top-full mt-1 z-10 bg-[#2a2a2c] border border-white/10 rounded-xl overflow-hidden shadow-xl min-w-[120px]">
                      {FR_STATUS_OPTIONS.map(s => (
                        <button
                          key={s.value}
                          onClick={() => { handleStatusChange(r.id, s.value); setOpenStatusId(null); }}
                          className="w-full text-left px-3 py-2 text-[11px] font-mono hover:bg-white/5 transition-all flex items-center gap-2"
                          style={{ color: s.color }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                  <div className="relative">
                    <button
                      onClick={() => setOpenEditStatusMenu(v => !v)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#1F1F21] border border-white/10 text-xs font-mono transition-all hover:border-white/20 focus:outline-none"
                      style={{ color: FR_STATUS_OPTIONS.find(s => s.value === editStatus)?.color ?? '#fff' }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: FR_STATUS_OPTIONS.find(s => s.value === editStatus)?.color }} />
                      {FR_STATUS_OPTIONS.find(s => s.value === editStatus)?.label ?? editStatus}
                      <ChevronDown className="h-3 w-3 opacity-50 ml-0.5" />
                    </button>
                    {openEditStatusMenu && (
                      <div className="absolute left-0 top-full mt-1 z-10 bg-[#2a2a2c] border border-white/10 rounded-xl overflow-hidden shadow-xl min-w-[120px]">
                        {FR_STATUS_OPTIONS.map(s => (
                          <button
                            key={s.value}
                            onClick={() => { setEditStatus(s.value); setOpenEditStatusMenu(false); }}
                            className="w-full text-left px-3 py-2 text-[11px] font-mono hover:bg-white/5 transition-all flex items-center gap-2"
                            style={{ color: s.color }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={saveEdit}
                    disabled={saving || !editTitle.trim()}
                    className="px-4 py-1.5 rounded-xl bg-[#FFD528] text-[#1F1F21] text-xs font-bold font-mono transition-all disabled:opacity-40 hover:bg-[#FFD528]/90"
                  >
                    {saving ? 'Saving\u2026' : 'Save'}
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

export function AdminPage() {
  usePageTitle('Admin');
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantingLifetime, setGrantingLifetime] = useState<string | null>(null);
  const [revokingLifetime, setRevokingLifetime] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userList, setUserList] = useState<UserListEntry[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<'dashboard' | 'feature-requests'>('dashboard');
  const frReloadRef = useRef<(() => void) | null>(null);
  const [frLoading, setFrLoading] = useState(false);
  function loadAdminFeatureRequests() {
    frReloadRef.current?.();
  }

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
      Sentry.captureException(e, { extra: { context: 'AdminPage fetchStats' } });
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

  async function fetchUsers() {
    if (!session?.access_token) return;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const resp = await fetch(`${supabaseUrl}/functions/v1/admin-users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`);
      setUserList(json.userList);
    } catch (e) {
      Sentry.captureException(e, { extra: { context: 'AdminPage fetchUsers' } });
      setUsersError((e as Error).message);
    } finally {
      setUsersLoading(false);
    }
  }

  async function revokeLifetime(userId: string) {
    if (!session?.access_token) return;
    setRevokingLifetime(userId);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const resp = await fetch(`${supabaseUrl}/functions/v1/revoke-lifetime`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`);
      setUserList(prev => prev ? prev.map(u => u.user_id === userId ? { ...u, status: 'trialing', trial_ends_at: new Date().toISOString() } : u) : prev);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setRevokingLifetime(null);
    }
  }

  async function grantLifetime(userId: string) {
    if (!session?.access_token) return;
    setGrantingLifetime(userId);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const resp = await fetch(`${supabaseUrl}/functions/v1/grant-lifetime`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': anonKey,
        },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`);
      setUserList(prev => prev ? prev.map(u => u.user_id === userId ? { ...u, status: 'lifetime' } : u) : prev);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setGrantingLifetime(null);
    }
  }

  if (!user || user.email !== ADMIN_EMAIL) return null;

  return (
    <div className="space-y-2 pb-12 bg-[#1F1F21] rounded-3xl p-6 -m-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white font-mono flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-[#FFD528]" />
            Admin Dashboard
          </h1>
          <p className="text-xs text-white/30 mt-0.5">
            {adminTab === 'dashboard' ? 'Platform analytics — visible only to you' : 'Manage feature requests'}
          </p>
        </div>
        <button
          onClick={adminTab === 'dashboard' ? fetchStats : loadAdminFeatureRequests}
          disabled={adminTab === 'dashboard' ? loading : frLoading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-mono transition-all disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${(adminTab === 'dashboard' ? loading : frLoading) ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

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

      {adminTab === 'dashboard' && (
      <>
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

          {/* ── Users table ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-between mt-6 mb-3">
            <h2 className="text-sm font-bold text-white/50 font-mono uppercase tracking-widest">All Users</h2>
            {!userList && (
              <button
                onClick={fetchUsers}
                disabled={usersLoading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-mono transition-all disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${usersLoading ? 'animate-spin' : ''}`} />
                {usersLoading ? 'Loading…' : 'Load users'}
              </button>
            )}
            {userList && (
              <button
                onClick={fetchUsers}
                disabled={usersLoading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-mono transition-all disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${usersLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            )}
          </div>
          {usersError && (
            <div className="bg-[#D45B5B]/10 border border-[#D45B5B]/25 rounded-2xl p-4 text-[#D45B5B] text-sm font-mono mb-3">
              Error: {usersError}
            </div>
          )}
          {userList && (
            <div className="bg-[#2a2a2c] rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-3 border-b border-white/5">
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="w-full bg-[#1F1F21] text-white text-sm font-mono rounded-xl px-3 py-2 border border-white/10 placeholder:text-white/25 focus:outline-none focus:border-[#FFD528]/40"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left text-white/30 px-4 py-2 font-normal">Name</th>
                      <th className="text-left text-white/30 px-4 py-2 font-normal">Email</th>
                      <th className="text-left text-white/30 px-4 py-2 font-normal">Status</th>
                      <th className="text-left text-white/30 px-4 py-2 font-normal">Joined</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {userList
                      .filter(u => {
                        const q = userSearch.toLowerCase();
                        return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
                      })
                      .map(u => (
                        <tr key={u.user_id} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                          <td className="px-4 py-2.5 text-white/80">{u.name || <span className="text-white/25">—</span>}</td>
                          <td className="px-4 py-2.5 text-white/50">{u.email}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                              style={{
                                background: `${PIE_COLORS[u.status] ?? '#6b7280'}20`,
                                color: PIE_COLORS[u.status] ?? '#6b7280',
                              }}
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-white/30">
                            {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {u.status === 'lifetime' ? (
                              <button
                                onClick={() => revokeLifetime(u.user_id)}
                                disabled={revokingLifetime === u.user_id}
                                className="px-2.5 py-1 rounded-lg bg-[#D45B5B]/10 hover:bg-[#D45B5B]/20 text-[#D45B5B] text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
                              >
                                {revokingLifetime === u.user_id ? '…' : 'Revoke Lifetime'}
                              </button>
                            ) : (
                              <button
                                onClick={() => grantLifetime(u.user_id)}
                                disabled={grantingLifetime === u.user_id}
                                className="px-2.5 py-1 rounded-lg bg-[#c084fc]/10 hover:bg-[#c084fc]/20 text-[#c084fc] text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
                              >
                                {grantingLifetime === u.user_id ? '…' : 'Grant Lifetime'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      </>
      )}

      {adminTab === 'feature-requests' && (
        <AdminFeatureRequests reloadRef={frReloadRef} onLoadingChange={setFrLoading} />
      )}
    </div>
  );
}
