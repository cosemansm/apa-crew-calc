import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Plus, FolderOpen, Star, StarOff, ChevronLeft, ChevronRight,
  Calendar, Clock, X, TrendingUp, Sparkles, Edit3, Bell, Info, Trash2, Share, Link
} from 'lucide-react';
import { toast } from 'sonner';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameMonth, isSameDay, parseISO, addDays
} from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { getCurrencySymbol, groupByCurrency, formatMultiCurrencyTotal } from '@/lib/currency';
import { getEngine } from '@/engines/index';
import { APA_CREW_ROLES, DEPARTMENTS, getRolesByDepartment, type CrewRole } from '@/data/apa-rates';
import { STATUS_CONFIG, StatusBadge, type ProjectStatus } from '@/lib/projectStatus';
import { TrialBanner } from '@/components/TrialBanner';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { JobLimitDialog } from '@/components/JobLimitDialog';
import { BookkeepingSection } from '@/components/BookkeepingSection';
import { BookkeepingPopup } from '@/components/BookkeepingPopup';
import { shouldShowBookkeepingPopup, getPopupVariant } from '@/lib/bookkeepingPopup';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { WhatsNewDrawer, useUnreadCount } from '@/components/WhatsNewDrawer';
import { useEngine } from '@/hooks/useEngine';
import { useConvertedTotals } from '@/hooks/useConvertedTotals';
import { getEngineCurrency } from '@/lib/exchangeRate';

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  created_at: string;
  status: ProjectStatus;
  calc_engine?: string | null;
  days: ProjectDay[];
}

interface ProjectDay {
  id: string;
  project_id: string;
  day_number: number;
  work_date: string;
  role_name: string;
  grand_total: number;
  result_json?: { grandTotal?: number } | null;
}

interface FavouriteRole {
  id: string;
  role_name: string;
  default_rate: number | null;
}

// Resolve the best available grand total for a day
function dayTotal(d: ProjectDay): number {
  if (d.grand_total && d.grand_total > 0) return d.grand_total;
  return d.result_json?.grandTotal ?? 0;
}

// --- sessionStorage cache helpers (stale-while-revalidate) ---
const CACHE_KEY_PROJECTS = 'cache:dashboard:projects';
const CACHE_KEY_FAVOURITES = 'cache:dashboard:favourites';
const CACHE_KEY_SETTINGS = 'cache:dashboard:settings';

function cacheSet(key: string, data: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}
function cacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch { return null; }
}


export function DashboardPage() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const { isImpersonating, impersonatedData } = useImpersonation();
  const { defaultEngineId, showEngineSelector } = useEngine();
  const { subscription, isPremium, isTrialing, trialDaysLeft, loading: subLoading } = useSubscription();
  const isLifetime = subscription?.status === 'lifetime';
  const navigate = useNavigate();
  const cachedProjects = cacheGet<Project[]>(CACHE_KEY_PROJECTS);
  const cachedFavourites = cacheGet<FavouriteRole[]>(CACHE_KEY_FAVOURITES);
  const cachedSettings = cacheGet<{ displayName: string | null; department: string | null }>(CACHE_KEY_SETTINGS);
  const hasCachedData = !!cachedProjects;

  const [projects, setProjects] = useState<Project[]>(cachedProjects ?? []);
  const [favourites, setFavourites] = useState<FavouriteRole[]>(cachedFavourites ?? []);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showNewProject, setShowNewProject] = useState(false);
  const [jobLimitOpen, setJobLimitOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [calendarNewJobDate, setCalendarNewJobDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(!hasCachedData);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(cachedSettings?.displayName ?? null);
  const [userDepartment, setUserDepartment] = useState<string | null>(cachedSettings?.department ?? null);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; published_at: string }[]>([]);
  const [badgeCount, setBadgeCount] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bookkeepingSoftware, setBookkeepingSoftware] = useState<string | null>(null);
  const [bookkeepingDismissedAt, setBookkeepingDismissedAt] = useState<string | null>(null);
  const [hasBookkeepingConnection, setHasBookkeepingConnection] = useState(true); // default true = don't show until checked
  const [bookkeepingPopupVisible, setBookkeepingPopupVisible] = useState(false);
  const unreadCount = useUnreadCount(notifications);

  // Calendar feed
  const [feedToken, setFeedToken] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedCopied, setFeedCopied] = useState(false);

  // Keep sessionStorage cache in sync for stale-while-revalidate on next page load
  useEffect(() => { if (projects.length > 0) cacheSet(CACHE_KEY_PROJECTS, projects); }, [projects]);
  useEffect(() => { if (favourites.length > 0) cacheSet(CACHE_KEY_FAVOURITES, favourites); }, [favourites]);

  useEffect(() => {
    if (isImpersonating && impersonatedData) {
      setProjects(impersonatedData.projects.map(p => ({
        ...p,
        status: p.status as ProjectStatus,
        days: p.days.map(d => ({
          ...d,
          result_json: d.result_json as { grandTotal?: number } | null,
        })),
      })));
      setFavourites(impersonatedData.favouriteRoles.map(f => ({
        id: f.id,
        role_name: f.role_name,
        default_rate: f.default_rate,
      })));
      setDisplayName(impersonatedData.displayName);
      setUserDepartment(impersonatedData.department);
      setLoading(false);
      return;
    }
    if (user) {
      const bg = hasCachedData;
      loadProjects(bg);
      loadFavourites();
      supabase
        .from('user_settings')
        .select('display_name, department, bookkeeping_software, bookkeeping_popup_dismissed_at')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.display_name) setDisplayName(data.display_name);
          if (data?.department) setUserDepartment(data.department);
          if (data?.bookkeeping_software) setBookkeepingSoftware(data.bookkeeping_software);
          if (data?.bookkeeping_popup_dismissed_at) setBookkeepingDismissedAt(data.bookkeeping_popup_dismissed_at);
          cacheSet(CACHE_KEY_SETTINGS, {
            displayName: data?.display_name ?? null,
            department: data?.department ?? null,
          });
        }, () => {});
    }
  }, [user, isImpersonating, impersonatedData]);

  useEffect(() => {
    async function fetchBadge() {
      const { data } = await supabase
        .from('release_notifications')
        .select('id, published_at')
        .order('published_at', { ascending: false });
      if (data) setNotifications(data);
    }
    if (user) fetchBadge().catch(() => {});
  }, [user]);

  useEffect(() => { setBadgeCount(unreadCount); }, [unreadCount]);

  useEffect(() => {
    if (!user || isImpersonating) return;
    supabase
      .from('bookkeeping_connections')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setHasBookkeepingConnection(!!data);
      }, () => {});
  }, [user, isImpersonating]);

  // Load existing calendar feed token
  useEffect(() => {
    if (!user || isImpersonating) return;
    supabase
      .from('calendar_feed_tokens')
      .select('token')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setFeedToken(data.token);
      });
  }, [user?.id, isImpersonating]);

  useEffect(() => {
    if (!subscription || isImpersonating) return;
    const show = shouldShowBookkeepingPopup({
      bookkeepingSoftware,
      hasBookkeepingConnection,
      subscriptionStatus: subscription.status,
      trialEndsAt: subscription.trial_ends_at,
      dismissedAt: bookkeepingDismissedAt,
    });
    setBookkeepingPopupVisible(show);
  }, [bookkeepingSoftware, hasBookkeepingConnection, subscription, bookkeepingDismissedAt, isImpersonating]);

  const loadProjects = async (background = false) => {
    if (!background) setLoading(true);
    const { data: projectsData } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (projectsData) {
      const projectIds = projectsData.map(p => p.id);
      const { data: daysData } = await supabase
        .from('project_days')
        .select('*')
        .in('project_id', projectIds.length > 0 ? projectIds : ['__none__'])
        .order('day_number', { ascending: true });

      const enriched = projectsData.map(p => ({
        ...p,
        days: (daysData || []).filter(d => d.project_id === p.id),
      }));
      setProjects(enriched);
    }
    setLoading(false);
  };

  const loadFavourites = async () => {
    const { data } = await supabase
      .from('favourite_roles')
      .select('*')
      .eq('user_id', user!.id);
    if (data) setFavourites(data);
  };

  const updateProjectStatus = async (projectId: string, newStatus: ProjectStatus) => {
    if (isImpersonating) return;
    const { error } = await supabase
      .from('projects')
      .update({ status: newStatus })
      .eq('id', projectId);
    if (!error) {
      setProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, status: newStatus } : p
      ));
    }
  };

  const toggleFavourite = async (role: CrewRole) => {
    if (isImpersonating) return;
    const existing = favourites.find(f => f.role_name === role.role);
    if (existing) {
      const { error } = await supabase.from('favourite_roles').delete().eq('id', existing.id);
      if (!error) {
        setFavourites(prev => prev.filter(f => f.id !== existing.id));
      } else {
        console.error('Failed to remove favourite:', error);
      }
    } else {
      const { data, error } = await supabase.from('favourite_roles').insert({
        user_id: user!.id,
        role_name: role.role,
        default_rate: role.maxRate,
      }).select().single();
      if (error) {
        console.error('Failed to add favourite:', error);
      } else if (data) {
        setFavourites(prev => [...prev, data]);
      }
    }
  };

  const createProject = async () => {
    if (isImpersonating) return;
    if (!newProjectName.trim()) return;
    setProjectError(null);
    const { data, error } = await supabase.from('projects').insert({
      user_id: user!.id,
      name: newProjectName.trim(),
      client_name: newClientName.trim() || null,
      calc_engine: defaultEngineId,
    }).select().single();

    if (error) {
      setProjectError(`Error: ${error.message} (code: ${error.code})`);
      return;
    }

    if (data) {
      setShowNewProject(false);
      setNewProjectName('');
      setNewClientName('');
      const dateParam = calendarNewJobDate ? `&date=${calendarNewJobDate}` : '';
      setCalendarNewJobDate(null);
      navigate(`/calculator?project=${data.id}&name=${encodeURIComponent(data.name)}${dateParam}`);
    }
  };

  const handleBookkeepingDismiss = async () => {
    setBookkeepingPopupVisible(false);
    if (!user) return;
    const now = new Date().toISOString();
    setBookkeepingDismissedAt(now);
    await supabase.from('user_settings').update({
      bookkeeping_popup_dismissed_at: now,
    }).eq('user_id', user.id);
  };

  const generateFeedToken = async () => {
    if (!user) return;
    setFeedLoading(true);
    const { data, error } = await supabase
      .from('calendar_feed_tokens')
      .insert({ user_id: user.id })
      .select('token')
      .single();
    setFeedLoading(false);
    if (data) setFeedToken(data.token);
    if (error) toast.error('Failed to generate feed URL');
  };

  const regenerateFeedToken = async () => {
    if (!user) return;
    setFeedLoading(true);
    await supabase.from('calendar_feed_tokens').delete().eq('user_id', user.id);
    const { data, error } = await supabase
      .from('calendar_feed_tokens')
      .insert({ user_id: user.id })
      .select('token')
      .single();
    setFeedLoading(false);
    if (data) setFeedToken(data.token);
    if (error) toast.error('Failed to regenerate feed URL');
  };

  const copyFeedUrl = () => {
    if (!feedToken) return;
    const url = `${window.location.origin}/api/calendar/${feedToken}`;
    navigator.clipboard.writeText(url);
    setFeedCopied(true);
    toast.success('Feed URL copied to clipboard');
    setTimeout(() => setFeedCopied(false), 2000);
  };

  const deleteProject = async (projectId: string) => {
    if (isImpersonating) return;
    setDeleting(true);
    await supabase.from('project_days').delete().eq('project_id', projectId);
    await supabase.from('projects').delete().eq('id', projectId);
    setProjects(prev => prev.filter(p => p.id !== projectId));
    setDeleteConfirm(null);
    setDeleting(false);
  };

  // Calendar data
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const allProjectDays = useMemo(() => {
    return projects.flatMap(p => p.days.map(d => ({
      ...d,
      projectName: p.name,
      projectStatus: (p.status ?? 'ongoing') as ProjectStatus,
      calc_engine: p.calc_engine ?? null,
    })));
  }, [projects]);

  // Earliest work_date per project — used to sort bars consistently across days
  // so a project always occupies the same vertical slot, keeping bars visually connected
  const projectFirstDate = useMemo(() => {
    const map: Record<string, string> = {};
    allProjectDays.forEach(d => {
      if (!map[d.project_id] || d.work_date < map[d.project_id]) {
        map[d.project_id] = d.work_date;
      }
    });
    return map;
  }, [allProjectDays]);

  const getDayProjects = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return allProjectDays
      .filter(d => d.work_date === dateStr)
      .sort((a, b) => {
        const fa = projectFirstDate[a.project_id] ?? a.work_date;
        const fb = projectFirstDate[b.project_id] ?? b.work_date;
        return fa.localeCompare(fb) || a.project_id.localeCompare(b.project_id);
      });
  };

  // Lookup: which project_ids are booked on each date (for connected bars)
  const bookedProjectsByDate = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    allProjectDays.forEach(d => {
      if (!map[d.work_date]) map[d.work_date] = new Set();
      map[d.work_date].add(d.project_id);
    });
    return map;
  }, [allProjectDays]);

  // Monthly stats
  const monthProjects = useMemo(() => {
    return allProjectDays.filter(d => {
      const date = parseISO(d.work_date);
      return isSameMonth(date, currentMonth);
    });
  }, [allProjectDays, currentMonth]);

  // Total calendar days in the month
  const totalDaysInMonth = calendarDays.length;

  // Yearly total
  const currentYear = new Date().getFullYear();

  // Currency conversion for dashboard totals
  const monthDayTotals = useMemo(() =>
    monthProjects.map(d => ({ calc_engine: d.calc_engine, total: dayTotal(d) })),
    [monthProjects],
  );
  const yearDayTotals = useMemo(() =>
    allProjectDays
      .filter(d => parseISO(d.work_date).getFullYear() === currentYear)
      .map(d => ({ calc_engine: d.calc_engine, total: dayTotal(d) })),
    [allProjectDays, currentYear],
  );
  const convertedMonth = useConvertedTotals(monthDayTotals, defaultEngineId);
  const convertedYear = useConvertedTotals(yearDayTotals, defaultEngineId);

  // Last 6 months for bar chart — aggregate by yyyy-MM key, converted when multi-currency
  const monthlyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    allProjectDays.forEach(d => {
      const key = format(parseISO(d.work_date), 'yyyy-MM');
      const cur = getEngineCurrency(d.calc_engine);
      const rate = convertedMonth.isConverting && !convertedMonth.failed && convertedMonth.rates[cur] != null
        ? convertedMonth.rates[cur]
        : 1;
      totals[key] = (totals[key] || 0) + dayTotal(d) * rate;
    });
    return totals;
  }, [allProjectDays, convertedMonth.isConverting, convertedMonth.failed, convertedMonth.rates]);

  // Per-month currency groupings for multi-currency bar tooltips (fallback only)
  const monthlyCurrencyGroups = useMemo(() => {
    const groups: Record<string, Record<string, number>> = {};
    allProjectDays.forEach(d => {
      const key = format(parseISO(d.work_date), 'yyyy-MM');
      if (!groups[key]) groups[key] = {};
      const symbol = getCurrencySymbol(d.calc_engine);
      groups[key][symbol] = (groups[key][symbol] ?? 0) + dayTotal(d);
    });
    return groups;
  }, [allProjectDays]);

  const monthlyBreakdown = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const date = subMonths(now, 5 - i);
      const key = format(date, 'yyyy-MM');
      const total = monthlyTotals[key] || 0;
      const currencyGroups = monthlyCurrencyGroups[key] ?? {};
      return { date, total, currencyGroups, label: format(date, 'MMM'), isCurrent: isSameMonth(date, now) };
    });
  }, [monthlyTotals, monthlyCurrencyGroups]);

  const isFavourite = (roleName: string) => favourites.some(f => f.role_name === roleName);

  // Donut ring maths
  const donutRadius = 40;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const donutProgress = totalDaysInMonth > 0
    ? Math.min(monthProjects.length / totalDaysInMonth, 1)
    : 0;
  const donutOffset = donutCircumference * (1 - donutProgress);

  // Bar chart maths
  const barMax = Math.max(...monthlyBreakdown.map(m => m.total), 1);

  // Dominant currency symbol for Y-axis tick labels (use global engine when converting)
  const dominantCurrencySymbol = useMemo(() => {
    if (convertedMonth.isConverting && !convertedMonth.failed) return convertedMonth.targetSymbol;
    const symbols = new Set(allProjectDays.map(d => getCurrencySymbol(d.calc_engine)));
    return symbols.size === 1 ? [...symbols][0] : '£';
  }, [allProjectDays, convertedMonth.isConverting, convertedMonth.failed, convertedMonth.targetSymbol]);

  // Compute nice reference line step (3 evenly spaced ticks above barMax)
  function niceStep(maxVal: number): number {
    const rough = maxVal / 3;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1))));
    const normalized = rough / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return Math.max(nice * magnitude, 100);
  }
  const BAR_PX = 72; // pixel height of bar area
  const chartStep = niceStep(barMax);
  const chartMax = chartStep * 3;
  const chartTicks = [chartStep, chartStep * 2, chartStep * 3];

  function formatConverted(symbol: string, value: number) {
    return `${symbol}${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const conversionInfoPopover = (targetSymbol: string) => (
    <Popover>
      <PopoverTrigger asChild>
        <button className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Currency conversion info">
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="text-xs text-muted-foreground leading-relaxed max-w-[240px] p-3" side="bottom" align="center" collisionPadding={16}>
        Your account uses multiple currencies. Totals are converted to {targetSymbol} using daily ECB exchange rates and may differ slightly from actual values.
      </PopoverContent>
    </Popover>
  );

  return (
    <div className={cn("space-y-6 transition-all duration-300", whatsNewOpen ? 'mr-[400px]' : 'mr-0')}>
      <TrialBanner />
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Hi, {displayName || user?.email?.split('@')[0] || 'there'}!
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground hidden sm:block">Let's manage your crew bookings</p>
            {!subLoading && isTrialing && (
              <span className="hidden sm:inline text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                Trial — {trialDaysLeft}d left
              </span>
            )}
            {!subLoading && !isPremium && !isTrialing && (
              <span className="hidden sm:inline text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2.5 py-0.5">
                Free Plan
              </span>
            )}
            {!subLoading && isLifetime && (
              <span className="hidden sm:inline text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-200 rounded-full px-2.5 py-0.5">
                Lifetime
              </span>
            )}
            {!subLoading && isPremium && !isTrialing && !isLifetime && (
              <span className="hidden sm:inline text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                Pro Plan
              </span>
            )}
          </div>
        </div>
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
            disabled={isImpersonating}
          >
            <Plus className="h-4 w-4" /> New Job
          </Button>
          {/* Bell — rightmost */}
          {!isImpersonating && (
            <button
              onClick={() => setWhatsNewOpen(true)}
              className="relative w-9 h-9 rounded-lg border border-border bg-background hover:bg-accent flex items-center justify-center transition-colors"
              title="What's new"
              aria-label="What's new"
            >
              <Bell className="h-4 w-4" />
              {badgeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 border-2 border-background">
                  {badgeCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* New Project Dialog */}
      {showNewProject && (
        <Card className="border-[#FFD528]/40">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold">Create New Job</h3>
              <Button variant="ghost" size="icon" onClick={() => { setShowNewProject(false); setCalendarNewJobDate(null); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Job Name</Label>
                <Input placeholder="e.g. Nike Summer Campaign" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-2">
                <Label>Client (optional)</Label>
                <Input placeholder="e.g. Nike UK" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
              </div>
            </div>
            {projectError && <p className="text-sm text-red-500 mt-3">{projectError}</p>}
            <div className="flex gap-2 mt-4">
              <Button onClick={createProject} disabled={!newProjectName.trim()}>Create</Button>
              <Button variant="outline" onClick={() => { setShowNewProject(false); setCalendarNewJobDate(null); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar + Stats row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Calendar — takes 3/5 */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {format(currentMonth, 'MMMM yyyy')}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())}>Today</Button>
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Separator orientation="vertical" className="h-5 mx-1" />

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" title="Calendar feed">
                      <Share className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72">
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-semibold text-base flex items-center gap-2">
                          <Link className="h-4 w-4" />
                          Calendar Feed
                          {!isPremium && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">PRO</Badge>}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Subscribe to your booked days from any calendar app
                        </p>
                      </div>

                      {!isPremium ? (
                        <p className="text-xs text-muted-foreground">
                          Upgrade to Pro to generate a calendar feed URL.
                        </p>
                      ) : feedToken ? (
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={`${window.location.origin}/api/calendar/${feedToken}`}
                              className="flex-1 rounded-md border bg-muted/50 px-2 py-1.5 text-[11px] font-mono truncate"
                            />
                            <Button size="sm" onClick={copyFeedUrl}>
                              {feedCopied ? 'Copied!' : 'Copy'}
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Paste into your calendar app's "Subscribe by URL". Updates may take up to 24h.
                          </p>
                          <button
                            onClick={regenerateFeedToken}
                            disabled={feedLoading}
                            className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {feedLoading ? 'Regenerating...' : 'Regenerate URL'}
                          </button>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground mb-4">
                            Generate a feed URL to sync your booked days with Google Calendar, Apple Calendar, or Outlook.
                          </p>
                          <Button className="w-full" onClick={generateFeedToken} disabled={feedLoading}>
                            {feedLoading ? 'Generating...' : 'Generate Feed URL'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-0">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
              ))}
              {Array.from({ length: (startDayOfWeek + 6) % 7 }, (_, i) => (
                <div key={`empty-${i}`} className="min-h-[52px]" />
              ))}
              {calendarDays.map(date => {
                const dayProjects = getDayProjects(date);
                const isToday = isSameDay(date, new Date());
                const isEmpty = dayProjects.length === 0;

                const dayCell = (
                  <div
                    className={`min-h-[52px] p-1 text-sm transition-all overflow-hidden ${
                      isToday ? 'bg-gray-100 rounded' : 'hover:bg-muted rounded'
                    } ${isEmpty ? 'cursor-pointer' : ''}`}
                  >
                    <span className={`block text-xs mb-0.5 ${isToday ? 'font-bold text-[#1F1F21]' : 'text-muted-foreground'}`}>
                      {format(date, 'd')}
                    </span>
                    {dayProjects.slice(0, 2).map((dp, i) => {
                      const prevDate = format(addDays(date, -1), 'yyyy-MM-dd');
                      const nextDate = format(addDays(date,  1), 'yyyy-MM-dd');
                      const connPrev = bookedProjectsByDate[prevDate]?.has(dp.project_id);
                      const connNext = bookedProjectsByDate[nextDate]?.has(dp.project_id);
                      const colour   = STATUS_CONFIG[dp.projectStatus].calendarBg;

                      // Bleed bar to cell edges on connecting sides by negating the cell's p-1 (4px) padding
                      const ml = connPrev ? -4 : 0;
                      const mr = connNext ? -4 : 0;

                      // Flat border-radius on sides that bleed into adjacent cells
                      const br =
                        connPrev && connNext ? '0'          :
                        connPrev             ? '0 2px 2px 0':
                        connNext             ? '2px 0 0 2px':
                                               '2px';

                      return (
                        <Popover key={`${dp.project_id}-${i}`}>
                          <PopoverTrigger asChild>
                            <div
                              title={dp.projectName}
                              style={{
                                backgroundColor: colour,
                                borderRadius: br,
                                marginTop: 2,
                                marginLeft: ml,
                                marginRight: mr,
                                padding: '2px 4px',
                                fontSize: 10,
                                fontWeight: 500,
                                color: '#fff',
                                lineHeight: '1.4',
                                minHeight: 16,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                cursor: 'pointer',
                              }}
                            >
                              {connPrev ? '\u00A0' : dp.projectName}
                            </div>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-4" side="bottom" align="start">
                            <p className="font-semibold text-sm text-[#1F1F21] leading-tight mb-0.5">{dp.projectName}</p>
                            <p className="text-xs text-muted-foreground mb-3">
                              {format(parseISO(dp.work_date), 'EEE d MMM yyyy')}
                              {dp.role_name ? ` · ${dp.role_name}` : ''}
                            </p>
                            {(() => {
                              const projectDays = allProjectDays.filter(d => d.project_id === dp.project_id);
                              const isMultiDay = projectDays.length > 1;
                              const jobTotal = isMultiDay
                                ? projectDays.reduce((sum, d) => sum + dayTotal(d), 0)
                                : dayTotal(dp);
                              return (
                                <div className="mb-3">
                                  {isMultiDay && (
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                                      Job total ({projectDays.length} days)
                                    </p>
                                  )}
                                  <p className="text-lg font-bold tracking-tight">
                                    {getCurrencySymbol(dp.calc_engine)}{jobTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
                                  </p>
                                </div>
                              );
                            })()}
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Project status</p>
                            <div className="grid grid-cols-2 gap-1 mb-3">
                              {(Object.keys(STATUS_CONFIG) as ProjectStatus[]).map(s => {
                                const cfg = STATUS_CONFIG[s];
                                const active = dp.projectStatus === s;
                                return (
                                  <button
                                    key={s}
                                    onClick={() => updateProjectStatus(dp.project_id, s)}
                                    className="text-[10px] font-medium px-2 py-1 rounded-lg border transition-all text-left"
                                    style={{
                                      backgroundColor: active ? cfg.badgeBg : 'transparent',
                                      color: active ? cfg.badgeText : '#6B7280',
                                      borderColor: active ? cfg.badgeBorder : '#E5E7EB',
                                    }}
                                  >
                                    {cfg.label}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => navigate(`/calculator?project=${dp.project_id}`)}
                                className="flex items-center gap-1.5 text-xs font-semibold bg-[#FFD528] text-[#1F1F21] hover:bg-[#e6c024] px-3 py-1.5 rounded-lg transition-colors"
                              >
                                <Edit3 className="h-3 w-3" />
                                Edit
                              </button>
                              <button
                                onClick={() => setDeleteConfirm({ id: dp.project_id, name: dp.projectName })}
                                className="flex items-center justify-center h-7 w-7 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Delete job"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      );
                    })}
                    {dayProjects.length > 2 && (
                      <div className="text-[9px] text-muted-foreground mt-0.5 leading-none">
                        +{dayProjects.length - 2}
                      </div>
                    )}
                  </div>
                );

                if (isEmpty) {
                  return (
                    <Popover key={date.toISOString()}>
                      <PopoverTrigger asChild>{dayCell}</PopoverTrigger>
                      <PopoverContent className="w-auto p-2" side="bottom" align="start">
                        <button
                          onClick={() => {
                            setCalendarNewJobDate(format(date, 'yyyy-MM-dd'));
                            setShowNewProject(true);
                          }}
                          className="flex items-center gap-1.5 text-xs font-medium text-[#1F1F21] hover:text-[#FFD528] transition-colors outline-none"
                        >
                          <Plus className="h-3 w-3" />
                          Add job
                        </button>
                      </PopoverContent>
                    </Popover>
                  );
                }

                return <div key={date.toISOString()}>{dayCell}</div>;
              })}
            </div>
          </CardContent>
        </Card>

        {/* Stats panel — takes 2/5 */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Monthly donut */}
          <Card>
            <CardContent className="p-5 relative">
              <div className="flex items-start justify-between mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {format(currentMonth, 'MMMM yyyy')}
                </p>
                {convertedMonth.isConverting && !convertedMonth.failed && !convertedMonth.loading && conversionInfoPopover(convertedMonth.targetSymbol)}
              </div>
              <div className="flex items-center gap-5">
                {/* SVG Donut ring */}
                <div className="relative shrink-0">
                  <svg width="96" height="96" viewBox="0 0 96 96">
                    {/* Track */}
                    <circle
                      cx="48" cy="48" r={donutRadius}
                      fill="none"
                      stroke="#E5E2DC"
                      strokeWidth="8"
                    />
                    {/* Progress */}
                    <circle
                      cx="48" cy="48" r={donutRadius}
                      fill="none"
                      stroke="#FFD528"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={donutCircumference}
                      strokeDashoffset={donutOffset}
                      transform="rotate(-90 48 48)"
                      style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                    />
                    {/* Centre text */}
                    <text x="48" y="44" textAnchor="middle" dominantBaseline="middle" className="font-bold" style={{ fontSize: 12, fontWeight: 700, fill: '#1F1F21' }}>
                      {monthProjects.length}
                    </text>
                    <text x="48" y="57" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 9, fill: '#8A8A8A' }}>
                      / {totalDaysInMonth} days
                    </text>
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Monthly earnings</p>
                  <p className="text-2xl font-bold tracking-tight">
                    {convertedMonth.isConverting && !convertedMonth.failed && convertedMonth.total != null
                      ? formatConverted(convertedMonth.targetSymbol, convertedMonth.total)
                      : formatMultiCurrencyTotal(groupByCurrency(monthProjects.map(d => ({ calc_engine: d.calc_engine, total: dayTotal(d) }))))
                    }
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {monthProjects.length} day{monthProjects.length !== 1 ? 's' : ''} booked
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Year total */}
          <Card>
            <CardContent className="p-5">
              {convertedYear.isConverting && !convertedYear.failed && !convertedYear.loading && (
                <div className="flex justify-end mb-1">
                  {conversionInfoPopover(convertedYear.targetSymbol)}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {currentYear} Total
                  </p>
                  <p className="text-2xl font-bold tracking-tight mt-1">
                    {convertedYear.isConverting && !convertedYear.failed && convertedYear.total != null
                      ? formatConverted(convertedYear.targetSymbol, convertedYear.total)
                      : formatMultiCurrencyTotal(groupByCurrency(
                          allProjectDays
                            .filter(d => parseISO(d.work_date).getFullYear() === currentYear)
                            .map(d => ({ calc_engine: d.calc_engine, total: dayTotal(d) }))
                        ))
                    }
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {allProjectDays.filter(d => parseISO(d.work_date).getFullYear() === currentYear).length} days worked
                  </p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-[#1F1F21] flex items-center justify-center shrink-0">
                  <TrendingUp className="h-5 w-5 text-[#FFD528]" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 6-month bar chart */}
          <Card className="flex-1">
            <CardContent className="p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                Income — last 6 months
              </p>
              {/* Chart: reference lines + bars */}
              <div className="relative" style={{ height: `${BAR_PX + 18}px` }}>
                {/* Reference lines */}
                {chartTicks.map(tick => {
                  const bottomPx = (tick / chartMax) * BAR_PX + 18;
                  return (
                    <div
                      key={tick}
                      className="absolute left-0 right-0 flex items-center pointer-events-none"
                      style={{ bottom: `${bottomPx}px` }}
                    >
                      <div className="flex-1 border-t border-dashed" style={{ borderColor: 'rgba(0,0,0,0.08)' }} />
                      <span className="text-[9px] text-muted-foreground/50 pl-1.5 shrink-0 font-mono">
                        {dominantCurrencySymbol}{tick >= 1000 ? `${(tick / 1000).toFixed(tick % 1000 === 0 ? 0 : 1)}k` : tick}
                      </span>
                    </div>
                  );
                })}
                {/* Bars */}
                <div className="absolute left-0 right-9 bottom-0 flex items-end gap-2" style={{ height: `${BAR_PX + 18}px` }}>
                  {monthlyBreakdown.map((m, idx) => {
                    const barPx = Math.max((m.total / chartMax) * BAR_PX, m.total > 0 ? 5 : 2);
                    return (
                      <div key={m.label} className="flex-1 flex flex-col items-center justify-end gap-1">
                        <div
                          className="w-full rounded-t-sm transition-all duration-700"
                          style={{
                            height: `${barPx}px`,
                            background: m.isCurrent ? '#FFD528' : '#1F1F21',
                            opacity: m.isCurrent ? 1 : 0.15 + (idx / monthlyBreakdown.length) * 0.55,
                          }}
                          title={m.total > 0
                            ? (convertedMonth.isConverting && !convertedMonth.failed
                              ? `${convertedMonth.targetSymbol}${m.total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : (Object.keys(m.currencyGroups).length > 0 ? formatMultiCurrencyTotal(m.currencyGroups) : '—'))
                            : '—'}
                        />
                        <span className="text-[10px] text-muted-foreground font-medium font-mono">{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Projects */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent Projects</h2>
          {projects.length > 0 && (
            <button
              onClick={() => navigate('/projects')}
              className="text-sm text-muted-foreground hover:text-foreground font-medium transition-colors flex items-center gap-1"
            >
              View all {projects.length > 6 ? `(${projects.length})` : ''} →
            </button>
          )}
        </div>
        {loading ? (
          <div className="text-muted-foreground text-sm">Loading projects...</div>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No projects yet. Create your first project to get started.</p>
              <Button className="mt-4" onClick={() => setShowNewProject(true)}>
                <Plus className="h-4 w-4 mr-1" /> Create Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {projects.slice(0, 6).map(project => {
                const totalCost = project.days.reduce((sum, d) => sum + dayTotal(d), 0);
                const sortedDays = [...project.days].sort((a, b) => a.work_date.localeCompare(b.work_date));
                const dateRange = sortedDays.length > 0
                  ? `${format(parseISO(sortedDays[0].work_date), 'dd MMM')}${sortedDays.length > 1 ? ` – ${format(parseISO(sortedDays[sortedDays.length - 1].work_date), 'dd MMM')}` : ''}`
                  : 'No days added';

                return (
                  <Card
                    key={project.id}
                    className="cursor-pointer hover:scale-[1.01] hover:shadow-lg transition-all duration-200"
                    onClick={() => navigate(`/calculator?project=${project.id}`)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{project.name}</h3>
                          {project.client_name && (
                            <p className="text-sm text-muted-foreground truncate">{project.client_name}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={project.status ?? 'ongoing'} />
                            <Badge variant="outline" className="text-xs">
                              {project.days.length} day{project.days.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          {showEngineSelector && project.calc_engine && project.calc_engine !== defaultEngineId && (() => {
                            try {
                              const e = getEngine(project.calc_engine);
                              return <Badge variant="outline" className="text-xs">{e.meta.shortName}</Badge>;
                            } catch { return null; }
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {dateRange}
                        </span>
                        <span className="font-medium text-foreground">
                          {totalCost > 0 ? `${getCurrencySymbol(project.calc_engine)}${totalCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '—'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {projects.length > 6 && (
              <button
                onClick={() => navigate('/projects')}
                className="mt-3 w-full rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                + {projects.length - 6} more job{projects.length - 6 !== 1 ? 's' : ''} — View all
              </button>
            )}
          </>
        )}
      </div>

      {/* Bookkeeping */}
      {user && (
        <BookkeepingSection
          userId={isImpersonating ? impersonatedData!.userId : user.id}
          isPremium={isPremium}
        />
      )}

      {/* My Department */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Star className="h-5 w-5 text-[#FFD528]" />
          My Department
          {userDepartment && (
            <span className="text-sm font-normal text-muted-foreground">— {userDepartment}</span>
          )}
        </h2>

        {!userDepartment ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground text-sm">Set your department in <button className="underline font-medium text-foreground" onClick={() => navigate('/settings')}>Settings</button> to see your roles here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Favourites within department */}
            <Card>
              <CardContent className="pt-5 pb-5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Favourites</p>
                {favourites.filter(f => APA_CREW_ROLES.find(r => r.role === f.role_name)?.department === userDepartment).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Star a role on the right to pin it here.</p>
                ) : (
                  <div className="space-y-2">
                    {favourites
                      .filter(f => APA_CREW_ROLES.find(r => r.role === f.role_name)?.department === userDepartment)
                      .map(fav => {
                        const role = APA_CREW_ROLES.find(r => r.role === fav.role_name);
                        return (
                          <div key={fav.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{fav.role_name}</p>
                              <p className="text-xs text-muted-foreground">£{fav.default_rate || role?.maxRate || '—'} / day</p>
                            </div>
                            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => role && toggleFavourite(role)}>
                              <Star className="h-4 w-4 fill-[#FFD528] text-[#FFD528]" />
                            </Button>
                          </div>
                        );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* All roles in department */}
            <Card>
              <CardContent className="pt-5 pb-5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{userDepartment} Roles</p>
                <div className="max-h-[320px] overflow-y-auto space-y-0.5 pr-1">
                  {getRolesByDepartment(userDepartment).map(role => (
                    <div
                      key={role.role}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="text-sm truncate block">{role.role}</span>
                        <span className="text-xs text-muted-foreground">up to £{role.maxRate}/day</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => toggleFavourite(role)}>
                        {isFavourite(role.role)
                          ? <Star className="h-3.5 w-3.5 fill-[#FFD528] text-[#FFD528]" />
                          : <StarOff className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <JobLimitDialog
        open={jobLimitOpen}
        onOpenChange={setJobLimitOpen}
        projects={projects}
        onDeleted={id => setProjects(prev => prev.filter(p => p.id !== id))}
        onProceed={() => setShowNewProject(true)}
      />
      <WhatsNewDrawer
        open={whatsNewOpen}
        onClose={() => setWhatsNewOpen(false)}
        onSeen={() => setBadgeCount(0)}
      />
      <Dialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete job</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">{deleteConfirm?.name}</span> and all its days? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteProject(deleteConfirm.id)}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {bookkeepingPopupVisible && bookkeepingSoftware && subscription && (
        <BookkeepingPopup
          variant={getPopupVariant({
            subscriptionStatus: subscription.status,
            trialEndsAt: subscription.trial_ends_at,
          })}
          software={bookkeepingSoftware}
          onDismiss={handleBookkeepingDismiss}
        />
      )}
    </div>
  );
}
