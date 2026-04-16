import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import * as Sentry from '@sentry/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import { Users, Briefcase, CalendarDays, PoundSterling, TrendingUp, Zap, RefreshCw, BarChart2, Lightbulb, ChevronDown, X, Upload, Trash2, Pencil, ArrowRight, Globe, Search, Save, Check, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { Switch } from '@/components/ui/switch';
import { getAllEngines } from '@/engines/index';

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
  resubscribed: '#38bdf8',
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

interface AdminNotification {
  id: string;
  title: string;
  description: string;
  category: string;
  button_label: string | null;
  discover_link: string;
  image_url: string | null;
  published_at: string;
}

const NOTIFICATION_CATEGORIES = [
  'General', 'Dashboard', 'Calculator', 'Projects', 'Invoices',
  'Timesheets', 'Bookkeeping', 'AI Input', 'Integrations',
  'Projects', 'Equipment', 'Expenses', 'PDF / Export',
  'Feature Requests', 'Settings', 'Subscription', 'Mobile',
];

const FEATURE_TAGS = [
  'General', 'Bug Report', 'Calculator', 'Invoices', 'AI Input', 'Projects',
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
    resubscribed: number;
    trialExtended: number;
    conversionRate: number;
    paidUsers: number;
  };
  jobs: {
    total: number;
    last30Days: number;
    byStatus: { status: string; count: number }[];
    byMonth: { month: string; count: number }[];
    byDay: { day: string; count: number }[];
    byWeek: { week: string; count: number }[];
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
  const { user } = useAuth();
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
      .insert({ title: newTitle.trim(), description: newDescription.trim(), tags: newTags, status: newStatus, user_id: user?.id, user_name: 'Admin' })
      .select()
      .single();
    if (!err && data) {
      setRequests(prev => [{ ...data, vote_count: 0 }, ...prev]);
      setNewTitle(''); setNewDescription(''); setNewTags([]); setNewStatus('requested');
      setShowCreate(false);
    } else if (err) {
      setError(err.message);
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

function AdminNotificationsPanel({ reloadRef }: { reloadRef: React.MutableRefObject<(() => void) | null> }) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [buttonLabel, setButtonLabel] = useState('');
  const [discoverLink, setDiscoverLink] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const linkDropdownRef = useRef<HTMLDivElement>(null);
  const [linkDropdownOpen, setLinkDropdownOpen] = useState(false);

  const APP_ROUTES = [
    { path: '/dashboard',        label: 'Dashboard' },
    { path: '/calculator',       label: 'Calculator' },
    { path: '/projects',         label: 'Projects' },
    { path: '/invoices',         label: 'Invoices' },
    { path: '/support',          label: 'Support' },
    { path: '/settings',         label: 'Settings' },
    { path: '/ai-input',         label: 'AI Input' },
    { path: '/admin',            label: 'Admin' },
    { path: '/login',            label: 'Login' },
    { path: '/terms',            label: 'Terms of Service' },
    { path: '/privacy',          label: 'Privacy Policy' },
    { path: '/update-password',  label: 'Update Password' },
    { path: '/share/:token',     label: 'Share link (dynamic)' },
  ];

  const filteredRoutes = APP_ROUTES.filter(r =>
    r.label.toLowerCase().includes(discoverLink.toLowerCase()) ||
    r.path.toLowerCase().includes(discoverLink.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        linkDropdownRef.current &&
        !linkDropdownRef.current.contains(e.target as Node) &&
        linkInputRef.current &&
        !linkInputRef.current.contains(e.target as Node)
      ) {
        setLinkDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('release_notifications')
        .select('*')
        .order('published_at', { ascending: false });
      if (!error && data) setNotifications(data as AdminNotification[]);
    } catch {
      // Network error (e.g. Safari "Load failed") — silently ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);
  useEffect(() => { reloadRef.current = fetchNotifications; }, [fetchNotifications, reloadRef]);

  function resetForm() {
    setEditId(null);
    setTitle('');
    setDescription('');
    setCategory('');
    setButtonLabel('');
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
    setButtonLabel(n.button_label ?? '');
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
        button_label: buttonLabel.trim() || null,
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
    const { error: deleteError } = await supabase.from('release_notifications').delete().eq('id', id);
    if (deleteError) { setError(deleteError.message); return; }
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
            <div className="relative">
              <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest font-mono mb-1.5">
                Discover link
              </label>
              <input
                ref={linkInputRef}
                value={discoverLink}
                onChange={e => { setDiscoverLink(e.target.value); setLinkDropdownOpen(true); }}
                onFocus={() => setLinkDropdownOpen(true)}
                placeholder="Type or select a page…"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white font-mono focus:outline-none focus:border-[#FFD528]/50"
              />
              {linkDropdownOpen && filteredRoutes.length > 0 && (
                <div
                  ref={linkDropdownRef}
                  className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-[#1F1F21] shadow-xl overflow-hidden"
                >
                  {filteredRoutes.map(r => (
                    <button
                      key={r.path}
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault();
                        setDiscoverLink(r.path);
                        setLinkDropdownOpen(false);
                      }}
                      className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-white/5 group"
                    >
                      <span className="text-[13px] text-white/80 font-mono group-hover:text-white">{r.label}</span>
                      <span className="text-[11px] text-white/30 font-mono group-hover:text-[#FFD528]/70">{r.path}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Button label */}
          <div className="mb-3">
            <label className="block text-[11px] font-bold text-white/40 uppercase tracking-widest font-mono mb-1.5">
              Button label
            </label>
            <input
              value={buttonLabel}
              onChange={e => setButtonLabel(e.target.value)}
              placeholder={`e.g. Try it now, See what's new, View invoices`}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white font-mono focus:outline-none focus:border-[#FFD528]/50"
            />
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
                <p className="text-[12px] font-bold font-mono leading-snug mb-1" style={{ color: title ? '#fff' : 'rgba(255,255,255,0.2)' }}>
                  {title || 'Your title will appear here'}
                </p>
                <p className="text-[10px] font-mono leading-relaxed mb-2.5 whitespace-pre-wrap" style={{ color: description ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)' }}>
                  {description || 'Your description will appear here...'}
                </p>
                <button className="inline-flex items-center gap-1 bg-[#FFD528] text-[#1F1F21] text-[10px] font-bold px-2.5 py-1.5 rounded-md font-mono">
                  {buttonLabel.trim() || (category ? `Discover ${category}` : '...')} <ArrowRight className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface EngineUserEntry {
  id: string;
  email: string;
  display_name: string | null;
  signup_country: string | null;
  multi_engine_enabled: boolean;
  authorized_engines: string[];
}

function EngineAccessRow({
  user,
  onToggleMultiEngine,
  onToggleEngine,
}: {
  user: EngineUserEntry;
  onToggleMultiEngine: (userId: string) => void;
  onToggleEngine: (userId: string, engineId: string) => void;
}) {
  const allEngines = useMemo(() => getAllEngines(), []);

  return (
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/3">
      <td className="px-4 py-2.5 text-white/80 font-mono text-xs">{user.display_name ?? <span className="text-white/25">—</span>}</td>
      <td className="px-4 py-2.5 text-white/50 font-mono text-xs">{user.email || <span className="text-white/25">—</span>}</td>
      <td className="px-4 py-2.5 text-white/50 font-mono text-xs">{user.signup_country ?? <span className="text-white/25">—</span>}</td>
      <td className="px-4 py-2.5">
        <Switch
          checked={user.multi_engine_enabled}
          onCheckedChange={() => onToggleMultiEngine(user.id)}
        />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-2">
          {allEngines.map(e => (
            <label key={e.meta.id} className="flex items-center gap-1 text-xs font-mono text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={user.authorized_engines.includes(e.meta.id)}
                onChange={() => onToggleEngine(user.id, e.meta.id)}
                className="accent-[#FFD528]"
              />
              {e.meta.shortName} ({e.meta.currencySymbol})
            </label>
          ))}
        </div>
      </td>
    </tr>
  );
}

export function AdminPage() {
  usePageTitle('Admin');
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const { startImpersonation, impersonationLoading } = useImpersonation();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const VALID_TABS = ['dashboard', 'users', 'feature-requests', 'notifications', 'engine-access'] as const;
  type AdminTab = typeof VALID_TABS[number];
  const adminTab: AdminTab = (VALID_TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as AdminTab) : 'dashboard';
  function setAdminTab(id: AdminTab) { navigate(`/admin/${id}`, { replace: true }); }
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantingLifetime, setGrantingLifetime] = useState<string | null>(null);
  const [revokingLifetime, setRevokingLifetime] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userList, setUserList] = useState<UserListEntry[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [engineUsers, setEngineUsers] = useState<EngineUserEntry[]>([]);
  const [engineUsersOriginal, setEngineUsersOriginal] = useState<EngineUserEntry[]>([]);
  const [engineUsersLoading, setEngineUsersLoading] = useState(false);
  const [engineUsersError, setEngineUsersError] = useState<string | null>(null);
  const [engineUserSearch, setEngineUserSearch] = useState('');
  const [engineSaving, setEngineSaving] = useState(false);
  const [engineSaveSuccess, setEngineSaveSuccess] = useState(false);
  const [jobsView, setJobsView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const frReloadRef = useRef<(() => void) | null>(null);
  const [frLoading, setFrLoading] = useState(false);
  function loadAdminFeatureRequests() {
    frReloadRef.current?.();
  }
  const notifReloadRef = useRef<(() => void) | null>(null);
  function loadAdminNotifications() {
    notifReloadRef.current?.();
  }

  // Gate — redirect non-admins immediately
  useEffect(() => {
    if (user && user.email !== ADMIN_EMAIL) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  // Auto-load users when switching to Users tab
  useEffect(() => {
    if (adminTab === 'users' && !userList && !usersLoading) {
      fetchUsers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTab]);

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

  async function fetchEngineUsers() {
    if (!session?.access_token) return;
    setEngineUsersLoading(true);
    setEngineUsersError(null);
    try {
      // Fetch email list from admin-users edge function so we can cross-reference by user_id
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
      const emailMap: Record<string, string> = {};
      const nameMap: Record<string, string> = {};
      (json.userList as UserListEntry[]).forEach(u => {
        emailMap[u.user_id] = u.email;
        nameMap[u.user_id] = u.name;
      });

      // Profile data (multi_engine_enabled, authorized_engines, signup_country) is now
      // included in the admin-users response, fetched server-side via service role.
      const entries: EngineUserEntry[] = (json.userList as UserListEntry[]).map(u => ({
        id: u.user_id,
        email: u.email,
        display_name: u.name || null,
        signup_country: (u as unknown as { signup_country: string | null }).signup_country ?? null,
        multi_engine_enabled: (u as unknown as { multi_engine_enabled: boolean }).multi_engine_enabled ?? false,
        authorized_engines: (u as unknown as { authorized_engines: string[] }).authorized_engines ?? ['apa-uk'],
      }));
      setEngineUsers(entries);
      setEngineUsersOriginal(entries.map(e => ({ ...e, authorized_engines: [...e.authorized_engines] })));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setEngineUsersError(msg);
      Sentry.captureException(err, { extra: { context: 'fetchEngineUsers' } });
      console.error('fetchEngineUsers failed:', err);
    } finally {
      setEngineUsersLoading(false);
    }
  }

  function handleToggleMultiEngine(userId: string) {
    setEngineUsers(prev => prev.map(u => u.id === userId ? { ...u, multi_engine_enabled: !u.multi_engine_enabled } : u));
    setEngineSaveSuccess(false);
  }

  function handleToggleEngine(userId: string, engineId: string) {
    setEngineUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const next = u.authorized_engines.includes(engineId)
        ? u.authorized_engines.filter(id => id !== engineId)
        : [...u.authorized_engines, engineId];
      if (next.length === 0) return u; // minimum 1 engine
      return { ...u, authorized_engines: next };
    }));
    setEngineSaveSuccess(false);
  }

  const engineUsersDirty = useMemo(() => {
    return engineUsers.filter(u => {
      const orig = engineUsersOriginal.find(o => o.id === u.id);
      if (!orig) return false;
      return u.multi_engine_enabled !== orig.multi_engine_enabled
        || JSON.stringify([...u.authorized_engines].sort()) !== JSON.stringify([...orig.authorized_engines].sort());
    });
  }, [engineUsers, engineUsersOriginal]);

  async function saveEngineAccess() {
    if (!session?.access_token || engineUsersDirty.length === 0) return;
    setEngineSaving(true);
    setEngineUsersError(null);
    setEngineSaveSuccess(false);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    try {
      for (const u of engineUsersDirty) {
        const orig = engineUsersOriginal.find(o => o.id === u.id)!;
        if (u.multi_engine_enabled !== orig.multi_engine_enabled) {
          const resp = await fetch(`${supabaseUrl}/functions/v1/admin-update-engine-access`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'apikey': anonKey },
            body: JSON.stringify({ user_id: u.id, field: 'multi_engine_enabled', value: u.multi_engine_enabled }),
          });
          const json = await resp.json();
          if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`);
        }
        if (JSON.stringify([...u.authorized_engines].sort()) !== JSON.stringify([...orig.authorized_engines].sort())) {
          const resp = await fetch(`${supabaseUrl}/functions/v1/admin-update-engine-access`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'apikey': anonKey },
            body: JSON.stringify({ user_id: u.id, field: 'authorized_engines', value: u.authorized_engines }),
          });
          const json = await resp.json();
          if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`);
        }
      }
      setEngineUsersOriginal(engineUsers.map(e => ({ ...e, authorized_engines: [...e.authorized_engines] })));
      setEngineSaveSuccess(true);
      setTimeout(() => setEngineSaveSuccess(false), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setEngineUsersError(msg);
      Sentry.captureException(err, { extra: { context: 'saveEngineAccess' } });
    } finally {
      setEngineSaving(false);
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
            {adminTab === 'dashboard'
              ? 'Platform analytics — visible only to you'
              : adminTab === 'users'
              ? 'All users — view as, grant lifetime'
              : adminTab === 'feature-requests'
              ? 'Manage feature requests'
              : adminTab === 'notifications'
              ? 'Publish release notifications'
              : 'Manage user engine access'}
          </p>
        </div>
        <button
          onClick={adminTab === 'dashboard' ? fetchStats : adminTab === 'users' ? fetchUsers : adminTab === 'feature-requests' ? loadAdminFeatureRequests : adminTab === 'engine-access' ? fetchEngineUsers : loadAdminNotifications}
          disabled={adminTab === 'dashboard' ? loading : adminTab === 'users' ? usersLoading : adminTab === 'feature-requests' ? frLoading : adminTab === 'engine-access' ? engineUsersLoading : false}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-mono transition-all disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${(adminTab === 'dashboard' ? loading : adminTab === 'users' ? usersLoading : adminTab === 'feature-requests' ? frLoading : adminTab === 'engine-access' ? engineUsersLoading : false) ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tab row */}
      <div className="flex gap-1 mb-2">
        {[
          { id: 'dashboard' as const, label: 'Dashboard', icon: BarChart2 },
          { id: 'users' as const, label: 'Users', icon: Users },
          { id: 'feature-requests' as const, label: 'Feature Requests', icon: Lightbulb },
          { id: 'notifications' as const, label: 'Notifications', icon: Zap },
          { id: 'engine-access' as const, label: 'Engine Access', icon: Globe },
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
            <StatCard label="Total Projects" value={stats.jobs.total} sub={`avg ${stats.jobs.avgPerUser} per user`} icon={Briefcase} />
            <StatCard label="Days Logged" value={stats.days.total.toLocaleString()} sub={`+${stats.days.last30Days} last 30d`} icon={CalendarDays} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <StatCard label="Total Value Calc'd" value={formatGBP(stats.days.totalValue)} sub="across all users" icon={PoundSterling} accent />
            <StatCard label="Avg Day Rate" value={formatGBP(stats.days.avgRate)} sub="per work day" icon={TrendingUp} />
            <StatCard label="Active (30d)" value={stats.users.activeLastMonth} sub="users signed in" icon={Users} />
            <StatCard label="On Trial" value={stats.subscriptions.trialing} sub={`${stats.subscriptions.trialExtended} extended`} icon={Zap} />
          </div>

          {/* ── Jobs Chart (tabbed: 30d / 52w / 12m) ───────────────────── */}
          <SectionTitle>
            {jobsView === 'daily' ? 'Projects Added — Last 30 Days' : jobsView === 'weekly' ? 'Projects Added — Last 52 Weeks' : 'Projects Added — Last 12 Months'}
          </SectionTitle>
          <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
            {/* View tabs */}
            <div className="flex gap-1 mb-3">
              {(['daily', 'weekly', 'monthly'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setJobsView(v)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all border ${
                    jobsView === v
                      ? 'bg-[#FFD528]/15 text-[#FFD528] border-[#FFD528]/25'
                      : 'bg-white/5 text-white/40 hover:text-white/60 border-transparent'
                  }`}
                >
                  {v === 'daily' ? '30d' : v === 'weekly' ? '52w' : '12m'}
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={(
                jobsView === 'daily' ? (stats.jobs.byDay ?? [])
                : jobsView === 'weekly' ? (stats.jobs.byWeek ?? [])
                : stats.jobs.byMonth
              ) as object[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey={jobsView === 'monthly' ? 'month' : jobsView === 'weekly' ? 'week' : 'day'}
                  tickFormatter={(value: string, index: number) => {
                    if (jobsView === 'daily') {
                      if (index % 5 !== 0 && index !== 29) return '';
                      const [y, m, d] = value.split('-');
                      return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toLocaleString('default', { month: 'short', day: 'numeric' });
                    }
                    if (jobsView === 'weekly') {
                      if (index % 8 !== 0 && index !== 51) return '';
                      const [y, m, d] = value.split('-');
                      return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toLocaleString('default', { month: 'short', day: 'numeric' });
                    }
                    return shortMonth(value);
                  }}
                  tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={24} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={(props: any) => {
                    const { active, payload } = props;
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload;
                    let label = '';
                    if (jobsView === 'daily' && typeof item.day === 'string') {
                      const [y, m, d] = item.day.split('-');
                      label = new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toLocaleString('default', { weekday: 'short', month: 'short', day: 'numeric' });
                    } else if (jobsView === 'weekly' && typeof item.week === 'string') {
                      const [y, m, d] = item.week.split('-');
                      label = `Week of ${new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toLocaleString('default', { month: 'short', day: 'numeric' })}`;
                    } else if (typeof item.month === 'string') {
                      label = `${shortMonth(item.month)} ${item.month.slice(0, 4)}`;
                    }
                    const count = typeof item.count === 'number' ? item.count : 0;
                    return (
                      <div style={{ background: CHARCOAL, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontFamily: 'monospace', fontSize: 12, padding: '8px 12px' }}>
                        <div style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{label}</div>
                        <div style={{ color: YELLOW }}>{count} job{count !== 1 ? 's' : ''}</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" fill={YELLOW} radius={[3, 3, 0, 0]} name="Projects added" />
              </BarChart>
            </ResponsiveContainer>
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
                      { name: 'Free churned', value: stats.subscriptions.free, key: 'free' },
                      { name: 'Pro', value: stats.subscriptions.active, key: 'active' },
                      { name: 'Lifetime', value: stats.subscriptions.lifetime, key: 'lifetime' },
                      { name: 'Past Due', value: stats.subscriptions.pastDue, key: 'pastDue' },
                      { name: 'Churned', value: stats.subscriptions.canceled, key: 'canceled' },
                      { name: 'Re-subscribed', value: stats.subscriptions.resubscribed, key: 'resubscribed' },
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
                      { key: 'lifetime' }, { key: 'pastDue' }, { key: 'canceled' }, { key: 'resubscribed' }
                    ].filter((_, i) => {
                      const vals = [stats.subscriptions.trialing, stats.subscriptions.free, stats.subscriptions.active, stats.subscriptions.lifetime, stats.subscriptions.pastDue, stats.subscriptions.canceled, stats.subscriptions.resubscribed];
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
                { label: 'Free churned', value: stats.subscriptions.free, color: '#6b7280' },
                { label: 'Pro', value: stats.subscriptions.active, color: '#4ade80' },
                { label: 'Lifetime', value: stats.subscriptions.lifetime, color: '#c084fc' },
                { label: 'Past Due', value: stats.subscriptions.pastDue, color: '#f97316' },
                { label: 'Churned', value: stats.subscriptions.canceled, color: '#D45B5B' },
                { label: 'Re-subscribed', value: stats.subscriptions.resubscribed, color: '#38bdf8' },
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
          <SectionTitle>Projects Created — Last 12 Months</SectionTitle>
          <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.jobs.byMonth.map(d => ({ ...d, month: shortMonth(d.month) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={24} />
                <Tooltip contentStyle={{ background: CHARCOAL, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontFamily: 'monospace', fontSize: 12 }} labelStyle={{ color: 'rgba(255,255,255,0.6)' }} itemStyle={{ color: '#60a5fa' }} />
                <Bar dataKey="count" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Projects" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Jobs by Status + Days by month ─────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <SectionTitle>Projects by Status</SectionTitle>
              <div className="bg-[#2a2a2c] rounded-2xl p-4 border border-white/5">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.jobs.byStatus} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="status" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={65} />
                    <Tooltip contentStyle={{ background: CHARCOAL, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontFamily: 'monospace', fontSize: 12 }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Projects">
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
                <Bar dataKey="count" fill={YELLOW} radius={[0, 4, 4, 0]} name="Users" barSize={16} />
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
                    <Bar dataKey="count" fill="#c084fc" radius={[0, 4, 4, 0]} name="Days" barSize={16} />
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
                    <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} name="Days" barSize={16} />
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
              { label: 'Shared Project Links', value: stats.features.sharedJobsTotal, sub: 'total links created' },
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
      </>
      )}

      {adminTab === 'users' && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white/50 font-mono uppercase tracking-widest">All Users</h2>
          </div>
          {usersLoading && !userList && (
            <div className="flex items-center justify-center py-24 text-white/30 text-sm font-mono">
              Loading users…
            </div>
          )}
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
                      <th className="px-4 py-2 text-right text-white/30 font-normal">View</th>
                      <th className="px-4 py-2 text-right text-white/30 font-normal">Subscription</th>
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
                              <button
                                onClick={async () => {
                                  try {
                                    await startImpersonation(u.user_id);
                                    navigate('/dashboard');
                                  } catch {
                                    // Error already captured by context
                                  }
                                }}
                                disabled={impersonationLoading}
                                className="px-2.5 py-1 rounded-lg bg-[#60a5fa]/10 hover:bg-[#60a5fa]/20 text-[#60a5fa] text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
                                title={`View as ${u.email}`}
                              >
                                <Eye className="h-3 w-3 inline mr-1" />
                                View as
                              </button>
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
        </div>
      )}

      {adminTab === 'feature-requests' && (
        <AdminFeatureRequests reloadRef={frReloadRef} onLoadingChange={setFrLoading} />
      )}
      {adminTab === 'notifications' && (
        <AdminNotificationsPanel reloadRef={notifReloadRef} />
      )}
      {adminTab === 'engine-access' && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white/50 font-mono uppercase tracking-widest">Engine Access</h2>
            {engineUsers.length === 0 && (
              <button
                onClick={fetchEngineUsers}
                disabled={engineUsersLoading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-mono transition-all disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${engineUsersLoading ? 'animate-spin' : ''}`} />
                {engineUsersLoading ? 'Loading…' : 'Load users'}
              </button>
            )}
          </div>
          {engineUsersError && (
            <p className="text-sm text-red-400">{engineUsersError}</p>
          )}
          {engineUsers.length > 0 && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
                <input
                  type="text"
                  value={engineUserSearch}
                  onChange={e => setEngineUserSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/5 text-white/70 placeholder-white/25 text-xs font-mono focus:outline-none focus:border-white/20"
                />
              </div>
              <div className="bg-[#2a2a2c] rounded-2xl border border-white/5 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left text-white/30 px-4 py-2 font-normal">Name</th>
                        <th className="text-left text-white/30 px-4 py-2 font-normal">Email</th>
                        <th className="text-left text-white/30 px-4 py-2 font-normal">Signup Country</th>
                        <th className="text-left text-white/30 px-4 py-2 font-normal">Multi-Engine</th>
                        <th className="text-left text-white/30 px-4 py-2 font-normal">Authorized Engines</th>
                      </tr>
                    </thead>
                    <tbody>
                      {engineUsers
                        .filter(u => {
                          const q = engineUserSearch.toLowerCase();
                          return !q || u.email.toLowerCase().includes(q) || (u.display_name ?? '').toLowerCase().includes(q);
                        })
                        .map(u => (
                          <EngineAccessRow
                            key={u.id}
                            user={u}
                            onToggleMultiEngine={handleToggleMultiEngine}
                            onToggleEngine={handleToggleEngine}
                          />
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveEngineAccess}
                  disabled={engineUsersDirty.length === 0 || engineSaving}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FFD528] hover:bg-[#FFD528]/90 text-[#1F1F21] text-xs font-mono font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Save className={`h-3.5 w-3.5 ${engineSaving ? 'animate-spin' : ''}`} />
                  {engineSaving ? 'Saving…' : `Save changes${engineUsersDirty.length > 0 ? ` (${engineUsersDirty.length})` : ''}`}
                </button>
                {engineSaveSuccess && (
                  <span className="flex items-center gap-1.5 text-green-400 text-xs font-mono">
                    <Check className="h-3.5 w-3.5" />
                    Changes saved successfully
                  </span>
                )}
              </div>
            </>
          )}
          {engineUsersLoading && engineUsers.length === 0 && (
            <div className="flex items-center justify-center py-16 text-white/30 text-sm font-mono">
              Loading…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
