import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Plus, FolderOpen, Star, StarOff, ChevronLeft, ChevronRight,
  Calendar, PoundSterling, Clock, X, TrendingUp, Sparkles
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameMonth, isSameDay, parseISO, addDays
} from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { APA_CREW_ROLES, DEPARTMENTS, getRolesByDepartment, type CrewRole } from '@/data/apa-rates';
import { STATUS_CONFIG, StatusBadge, type ProjectStatus } from './ProjectsPage';
import { TrialBanner } from '@/components/TrialBanner';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  created_at: string;
  status: ProjectStatus;
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

export function DashboardPage() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const { subscription, isPremium, isTrialing, trialDaysLeft } = useSubscription();
  const isLifetime = subscription?.status === 'lifetime';
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [favourites, setFavourites] = useState<FavouriteRole[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [loading, setLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userDepartment, setUserDepartment] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadProjects();
      loadFavourites();
      supabase
        .from('user_settings')
        .select('display_name, department')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.display_name) setDisplayName(data.display_name);
          if (data?.department) setUserDepartment(data.department);
        });
    }
  }, [user, location.key]);

  const loadProjects = async () => {
    setLoading(true);
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

  const toggleFavourite = async (role: CrewRole) => {
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
    if (!newProjectName.trim()) return;
    setProjectError(null);
    const { data, error } = await supabase.from('projects').insert({
      user_id: user!.id,
      name: newProjectName.trim(),
      client_name: newClientName.trim() || null,
    }).select().single();

    if (error) {
      setProjectError(`Error: ${error.message} (code: ${error.code})`);
      return;
    }

    if (data) {
      setShowNewProject(false);
      setNewProjectName('');
      setNewClientName('');
      navigate(`/calculator?project=${data.id}&name=${encodeURIComponent(data.name)}`);
    }
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

  const monthTotal = monthProjects.reduce((sum, d) => sum + dayTotal(d), 0);

  // Total calendar days in the month
  const totalDaysInMonth = calendarDays.length;

  // Yearly total
  const currentYear = new Date().getFullYear();
  const yearTotal = useMemo(() => {
    return allProjectDays
      .filter(d => parseISO(d.work_date).getFullYear() === currentYear)
      .reduce((sum, d) => sum + dayTotal(d), 0);
  }, [allProjectDays, currentYear]);

  // Last 6 months for bar chart — aggregate by yyyy-MM key to avoid new Date() closure issues
  const monthlyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    allProjectDays.forEach(d => {
      const key = format(parseISO(d.work_date), 'yyyy-MM');
      totals[key] = (totals[key] || 0) + dayTotal(d);
    });
    return totals;
  }, [allProjectDays]);

  const monthlyBreakdown = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const date = subMonths(now, 5 - i);
      const key = format(date, 'yyyy-MM');
      const total = monthlyTotals[key] || 0;
      return { date, total, label: format(date, 'MMM'), isCurrent: isSameMonth(date, now) };
    });
  }, [monthlyTotals]);

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

  return (
    <div className="space-y-6">
      <TrialBanner />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Hi, {displayName || user?.email?.split('@')[0] || 'there'}!
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">Let's manage your crew bookings</p>
            {isTrialing && (
              <span className="text-[10px] font-bold text-[#FFD528] bg-[#FFD528]/10 border border-[#FFD528]/25 rounded-full px-2.5 py-0.5">
                ✦ Trial — {trialDaysLeft}d left
              </span>
            )}
            {!isPremium && !isTrialing && (
              <span className="text-[10px] font-bold text-white/40 bg-white/5 border border-white/10 rounded-full px-2.5 py-0.5">
                Free Plan
              </span>
            )}
            {isLifetime && (
              <span className="text-[10px] font-bold text-[#c084fc] bg-purple-500/10 border border-purple-500/25 rounded-full px-2.5 py-0.5">
                ✦ Lifetime
              </span>
            )}
            {isPremium && !isTrialing && !isLifetime && (
              <span className="text-[10px] font-bold text-[#4ade80] bg-[#4ade80]/10 border border-[#4ade80]/25 rounded-full px-2.5 py-0.5">
                ✦ Pro Plan
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/ai-input')} className="gap-2">
            <Sparkles className="h-4 w-4" /> AI Input
          </Button>
          <Button onClick={() => setShowNewProject(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Job
          </Button>
        </div>
      </div>

      {/* New Project Dialog */}
      {showNewProject && (
        <Card className="border-[#FFD528]/40">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold">Create New Job</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowNewProject(false)}>
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
              <Button onClick={createProject} disabled={!newProjectName.trim()}>Create & Open Calculator</Button>
              <Button variant="outline" onClick={() => setShowNewProject(false)}>Cancel</Button>
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
                return (
                  <div
                    key={date.toISOString()}
                    className={`min-h-[52px] p-1 text-sm transition-all overflow-hidden ${
                      isToday ? 'bg-gray-100 rounded' : 'hover:bg-muted rounded'
                    }`}
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
                        <div
                          key={`${dp.project_id}-${i}`}
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
                          }}
                        >
                          {connPrev ? '\u00A0' : dp.projectName}
                        </div>
                      );
                    })}
                    {dayProjects.length > 2 && (
                      <div className="text-[9px] text-muted-foreground mt-0.5 leading-none">
                        +{dayProjects.length - 2}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Stats panel — takes 2/5 */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Monthly donut */}
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                {format(currentMonth, 'MMMM yyyy')}
              </p>
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
                  <p className="text-2xl font-bold tracking-tight">£{monthTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })}</p>
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {currentYear} Total
                  </p>
                  <p className="text-2xl font-bold tracking-tight mt-1">
                    £{yearTotal.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
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
                        £{tick >= 1000 ? `${(tick / 1000).toFixed(tick % 1000 === 0 ? 0 : 1)}k` : tick}
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
                          title={`£${m.total.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`}
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
          <h2 className="text-lg font-semibold">Recent Jobs</h2>
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
          <div className="text-muted-foreground text-sm">Loading jobs...</div>
        ) : projects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No jobs yet. Create your first job to get started.</p>
              <Button className="mt-4" onClick={() => setShowNewProject(true)}>
                <Plus className="h-4 w-4 mr-1" /> Create Job
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
                          <StatusBadge status={project.status ?? 'ongoing'} />
                          <Badge variant="outline" className="text-xs">
                            {project.days.length} day{project.days.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {dateRange}
                        </span>
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          <PoundSterling className="h-3.5 w-3.5" />
                          {totalCost > 0 ? `£${totalCost.toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : '—'}
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

    </div>
  );
}
