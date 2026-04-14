import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FolderOpen, Plus, Clock, ChevronRight,
  Calendar, User, Edit3, X, Sparkles, Trash2, Copy,
  Search, Send, Check, Lock,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { JobLimitDialog } from '@/components/JobLimitDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { APA_CREW_ROLES } from '@/data/apa-rates';
import { calculateCrewCost, type DayType, type DayOfWeek } from '@/data/calculation-engine';
import { useEngine } from '@/hooks/useEngine';
import { getEngine } from '@/engines/index';
import { getCurrencySymbol } from '@/lib/currency';

// ── Status config ────────────────────────────────────────────────────────────
export type ProjectStatus = 'ongoing' | 'finished' | 'invoiced' | 'paid';

export const STATUS_CONFIG: Record<ProjectStatus, {
  label: string;
  calendarBg: string;   // used in calendar bars
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}> = {
  ongoing:  { label: 'Ongoing',  calendarBg: '#3B82F6', badgeBg: '#EFF6FF', badgeText: '#1D4ED8', badgeBorder: '#BFDBFE' },
  finished: { label: 'Finished', calendarBg: '#22C55E', badgeBg: '#F0FDF4', badgeText: '#15803D', badgeBorder: '#BBF7D0' },
  invoiced: { label: 'Invoiced', calendarBg: '#8B5CF6', badgeBg: '#F5F3FF', badgeText: '#6D28D9', badgeBorder: '#DDD6FE' },
  paid:     { label: 'Paid',     calendarBg: '#F59E0B', badgeBg: '#FFFBEB', badgeText: '#92400E', badgeBorder: '#FDE68A' },
};

// ── Interfaces ───────────────────────────────────────────────────────────────
interface Project {
  id: string;
  name: string;
  client_name: string | null;
  created_at: string;
  status: ProjectStatus;
  calc_engine?: string;
}

interface ProjectDay {
  id: string;
  project_id: string;
  work_date: string;
  role_name: string;
  day_type: string;
  call_time: string;
  wrap_time: string;
  grand_total: number;
  agreed_rate: number;
  calc_engine?: string;
  result_json?: {
    lineItems?: { description: string; hours?: number; rate?: number; total: number; timeFrom?: string; timeTo?: string; isDayRate?: boolean }[];
    penalties?: { description: string; hours?: number; rate?: number; total: number }[];
    travelPay?: number;
    mileage?: number;
    mileageMiles?: number;
    subtotal?: number;
  };
}

const DAY_TYPE_LABELS: Record<string, string> = {
  basic_working: 'Basic Working Day',
  continuous_working: 'Continuous Working Day',
  travel: 'Travel Day',
  rest: 'Rest Day',
  prep: 'Prep Day',
  recce: 'Recce Day',
  build_strike: 'Build/Strike',
  pre_light: 'Pre-light',
};

const DAY_TYPE_SHORT: Record<string, string> = {
  basic_working: 'Shoot Day',
  continuous_working: 'Shoot Day',
  prep: 'Prep Day',
  recce: 'Recce Day',
  build_strike: 'Build / Strike Day',
  pre_light: 'Pre-light Day',
  rest: 'Rest Day',
  travel: 'Travel Day',
};

// ── StatusBadge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: ProjectStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.ongoing;
  return (
    <span
      style={{
        backgroundColor: cfg.badgeBg,
        color: cfg.badgeText,
        border: `1px solid ${cfg.badgeBorder}`,
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        padding: '2px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: cfg.calendarBg, display: 'inline-block', flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function ProjectsPage() {
  usePageTitle('Jobs');
  const { user } = useAuth();
  const { isPremium } = useSubscription();
  const navigate = useNavigate();
  const { showEngineSelector, defaultEngineId } = useEngine();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectDays, setProjectDays] = useState<ProjectDay[]>([]);
  const [daysLoading, setDaysLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [deletingDayId, setDeletingDayId] = useState<string | null>(null);
  const [jobSearch, setJobSearch] = useState('');

  const [jobLimitOpen, setJobLimitOpen] = useState(false);

  const [sharedProjectIds, setSharedProjectIds] = useState<Set<string>>(new Set());
  const [shareDialogProjectId, setShareDialogProjectId] = useState<string | null>(null);
  const [shareRecord, setShareRecord] = useState<{
    id: string;
    token: string;
    includeExpenses: boolean;
    includeEquipment: boolean;
  } | null>(null);
  const [shareDialogLoading, setShareDialogLoading] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [shareDialogError, setShareDialogError] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadProjects();
  }, [user]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      let projects: Project[] = (data as Project[]) ?? [];

      // ── Auto-finish: promote ongoing → finished when all days are in the past ──
      const today = new Date().toISOString().split('T')[0];
      const ongoingIds = projects.filter(p => p.status === 'ongoing').map(p => p.id);
      if (ongoingIds.length > 0) {
        const { data: dayRows } = await supabase
          .from('project_days')
          .select('project_id, work_date')
          .in('project_id', ongoingIds);

        // Find max work_date per project
        const maxDate: Record<string, string> = {};
        dayRows?.forEach(d => {
          if (!maxDate[d.project_id] || d.work_date > maxDate[d.project_id]) {
            maxDate[d.project_id] = d.work_date;
          }
        });

        // Projects whose latest day is strictly before today
        const toFinish = ongoingIds.filter(id => maxDate[id] && maxDate[id] < today);
        if (toFinish.length > 0) {
          await supabase.from('projects').update({ status: 'finished' }).in('id', toFinish);
          projects = projects.map(p => toFinish.includes(p.id) ? { ...p, status: 'finished' as ProjectStatus } : p);
        }
      }

      setProjects(projects);

      // Load which projects have active share links
      const projectIds = projects.map(p => p.id);
      if (projectIds.length > 0) {
        const { data: shareRows } = await supabase
          .from('shared_jobs')
          .select('project_id')
          .in('project_id', projectIds)
          .eq('is_active', true);
        if (shareRows) setSharedProjectIds(new Set(shareRows.map((r: any) => r.project_id)));
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
    setLoading(false);
  };

  const selectProject = async (project: Project) => {
    setSelectedProject(project);
    setDaysLoading(true);
    try {
      const { data } = await supabase
        .from('project_days')
        .select('*')
        .eq('project_id', project.id)
        .order('work_date', { ascending: true });
      setProjectDays(data || []);
    } catch { /* network error */ }
    setDaysLoading(false);
  };

  const closeDetail = () => {
    setSelectedProject(null);
    setProjectDays([]);
  };

  const handleNewJob = () => {
    if (!isPremium && projects.length >= 10) {
      setJobLimitOpen(true);
      return;
    }
    navigate('/calculator');
  };

  const updateStatus = async (status: ProjectStatus) => {
    if (!selectedProject) return;
    setStatusUpdating(true);
    const { error } = await supabase
      .from('projects')
      .update({ status })
      .eq('id', selectedProject.id);
    if (!error) {
      const updated = { ...selectedProject, status };
      setSelectedProject(updated);
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    }
    setStatusUpdating(false);
  };

  const deleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // don't trigger card click
    if (!confirm('Delete this job and all its days? This cannot be undone.')) return;
    await supabase.from('project_days').delete().eq('project_id', projectId);
    await supabase.from('projects').delete().eq('id', projectId);
    if (selectedProject?.id === projectId) closeDetail();
    setProjects(prev => prev.filter(p => p.id !== projectId));
  };

  const duplicateProject = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isPremium && projects.length >= 10) {
      setJobLimitOpen(true);
      return;
    }
    // Create the new project
    const { data: newProject, error } = await supabase.from('projects').insert({
      user_id: user!.id,
      name: `${project.name} (copy)`,
      client_name: project.client_name,
      status: 'ongoing',
      calc_engine: project.calc_engine,
    }).select().single();
    if (error || !newProject) return;

    // Copy all days from the original project
    const { data: days } = await supabase
      .from('project_days')
      .select('*')
      .eq('project_id', project.id)
      .order('work_date', { ascending: true });

    if (days && days.length > 0) {
      // Fetch user's custom roles so we can re-run the calculation engine
      const { data: customRoles } = await supabase
        .from('custom_roles')
        .select('*')
        .eq('user_id', user!.id);

      const copies = days.map(({ id: _id, project_id: _pid, created_at: _ca, ...day }) => {
        const role = (customRoles ?? []).find((r: { role: string }) => r.role === day.role_name)
          ?? APA_CREW_ROLES.find(r => r.role === day.role_name);

        // Re-run calculation engine so the copy gets precise (unrounded) totals
        if (role) {
          const result = calculateCrewCost({
            role,
            agreedDailyRate: day.agreed_rate,
            dayType: day.day_type as DayType,
            dayOfWeek: day.day_of_week as DayOfWeek,
            callTime: day.call_time,
            wrapTime: day.wrap_time,
            firstBreakGiven: day.first_break_given ?? false,
            firstBreakTime: day.first_break_time ?? undefined,
            firstBreakDurationMins: day.first_break_duration ?? 60,
            secondBreakGiven: day.second_break_given ?? false,
            secondBreakTime: day.second_break_time ?? undefined,
            secondBreakDurationMins: day.second_break_duration ?? 30,
            continuousFirstBreakGiven: day.continuous_first_break_given ?? false,
            continuousAdditionalBreakGiven: day.continuous_additional_break_given ?? false,
            travelHours: day.travel_hours ?? 0,
            mileageOutsideM25: day.mileage ?? 0,
            previousWrapTime: day.previous_wrap ?? undefined,
            equipmentValue: day.equipment_value ?? 0,
            equipmentDiscount: day.equipment_discount ?? 0,
          });
          return {
            ...day,
            project_id: newProject.id,
            result_json: result,
            grand_total: result.grandTotal + (day.expenses_amount ?? 0),
          };
        }

        // Fallback: role not found, copy as-is
        return { ...day, project_id: newProject.id };
      });

      await supabase.from('project_days').insert(copies);
    }

    setProjects(prev => [newProject as Project, ...prev]);
  };

  const openShareDialog = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isPremium) {
      navigate('/#pricing');
      return;
    }
    setShareDialogProjectId(projectId);
    setShareDialogLoading(true);
    setShareRecord(null);
    setShareDialogError(null);
    setShareLinkCopied(false);

    // Look for an existing active share record (limit 1 to avoid .maybeSingle errors when duplicates exist)
    const { data: shareRows, error: fetchError } = await supabase
      .from('shared_jobs')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);
    const data = shareRows?.[0] ?? null;

    if (data) {
      setShareRecord({
        id: data.id,
        token: data.token,
        includeExpenses: data.include_expenses,
        includeEquipment: data.include_equipment,
      });
    } else if (fetchError) {
      setShareDialogError(fetchError.message);
    } else {
      // Create a new share record
      const { data: newRecord, error: insertError } = await supabase
        .from('shared_jobs')
        .insert({ project_id: projectId, owner_id: user!.id, is_active: true })
        .select()
        .single();
      if (newRecord) {
        setShareRecord({
          id: newRecord.id,
          token: newRecord.token,
          includeExpenses: false,
          includeEquipment: false,
        });
        setSharedProjectIds(prev => new Set([...prev, projectId]));
      } else if (insertError) {
        setShareDialogError(insertError.message);
      }
    }
    setShareDialogLoading(false);
  };

  const updateShareToggle = async (
    field: 'include_expenses' | 'include_equipment',
    value: boolean,
  ) => {
    if (!shareRecord) return;
    await supabase
      .from('shared_jobs')
      .update({ [field]: value })
      .eq('id', shareRecord.id);
    setShareRecord(prev =>
      prev
        ? {
            ...prev,
            includeExpenses: field === 'include_expenses' ? value : prev.includeExpenses,
            includeEquipment: field === 'include_equipment' ? value : prev.includeEquipment,
          }
        : prev,
    );
  };

  const stopSharing = async () => {
    if (!shareRecord || !shareDialogProjectId) return;
    await supabase
      .from('shared_jobs')
      .update({ is_active: false })
      .eq('id', shareRecord.id);
    setSharedProjectIds(prev => {
      const next = new Set(prev);
      next.delete(shareDialogProjectId);
      return next;
    });
    setShareDialogProjectId(null);
    setShareRecord(null);
  };

  const copyShareLink = () => {
    if (!shareRecord) return;
    navigator.clipboard.writeText(
      `https://app.crewdock.app/share/${shareRecord.token}`,
    );
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  };

  const removeDay = async (dayId: string) => {
    if (!confirm('Remove this day from the project?')) return;
    setDeletingDayId(dayId);
    const { error } = await supabase.from('project_days').delete().eq('id', dayId);
    if (!error) setProjectDays(prev => prev.filter(d => d.id !== dayId));
    setDeletingDayId(null);
  };

  const projectTotal = projectDays.reduce((sum, d) => sum + (d.grand_total || 0), 0);

  const dateRange = projectDays.length > 0
    ? `${format(parseISO(projectDays[0].work_date), 'dd MMM yyyy')}${
        projectDays.length > 1
          ? ` – ${format(parseISO(projectDays[projectDays.length - 1].work_date), 'dd MMM yyyy')}`
          : ''
      }`
    : null;

  const filteredProjects = jobSearch.trim()
    ? projects.filter(p =>
        p.name.toLowerCase().includes(jobSearch.toLowerCase()) ||
        (p.client_name ?? '').toLowerCase().includes(jobSearch.toLowerCase())
      )
    : projects;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground mt-1">All your crew booking jobs</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/ai-input')} className="gap-2">
            <Sparkles className="h-4 w-4" /> AI Input
          </Button>
          <Button onClick={handleNewJob} className="gap-2">
            <Plus className="h-4 w-4" /> New Job
          </Button>
        </div>
      </div>


      {loading ? (
        <div className="text-muted-foreground text-sm">Loading jobs…</div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderOpen className="h-14 w-14 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">No jobs yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first job to get started</p>
            <Button onClick={handleNewJob}>
              <Plus className="h-4 w-4 mr-1" /> Create Job
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Project list — left */}
          <div className={`${selectedProject ? 'lg:col-span-2' : 'lg:col-span-5'}`}>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search jobs…"
                value={jobSearch}
                onChange={e => setJobSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD528]/50"
              />
            </div>
            <div className={`grid gap-3 ${selectedProject ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}>
              {filteredProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground col-span-full py-4 text-center">No jobs match your search.</p>
              ) : filteredProjects.map(project => {
                const isSelected = selectedProject?.id === project.id;
                return (
                  <div
                    key={project.id}
                    onClick={() => isSelected ? closeDetail() : selectProject(project)}
                    className={`rounded-2xl border p-4 cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? 'border-[#FFD528] bg-[#FFD528]/5 shadow-[0_0_0_2px_#FFD528]'
                        : 'bg-white border-border hover:shadow-md hover:border-[#1F1F21]/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-semibold truncate">{project.name}</p>
                          {sharedProjectIds.has(project.id) && (
                            <span className="shrink-0 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                              Shared
                            </span>
                          )}
                          {showEngineSelector && project.calc_engine && project.calc_engine !== defaultEngineId && (() => {
                            try {
                              const e = getEngine(project.calc_engine!)
                              return <Badge variant="outline" className="text-xs shrink-0">{e.meta.shortName}</Badge>
                            } catch {
                              return null
                            }
                          })()}
                        </div>
                        {project.client_name && (
                          <p className="text-sm text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            <User className="h-3 w-3 shrink-0" />
                            {project.client_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => openShareDialog(project.id, e)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            sharedProjectIds.has(project.id)
                              ? 'text-green-600 hover:bg-green-50'
                              : 'text-muted-foreground/40 hover:text-blue-500 hover:bg-blue-50'
                          }`}
                          title={isPremium ? 'Share job' : 'Upgrade to Pro to share jobs'}
                        >
                          {isPremium ? <Send className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={(e) => duplicateProject(project, e)}
                          className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                          title="Duplicate job"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => deleteProject(project.id, e)}
                          className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Delete job"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3 inline mr-1" />
                        Created {format(parseISO(project.created_at), 'dd MMM yyyy')}
                      </p>
                      <StatusBadge status={project.status ?? 'ongoing'} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Project detail — right */}
          {selectedProject && (
            <div className="lg:col-span-3">
              <Card className="sticky top-6">
                {/* Detail header */}
                <div className="flex items-start justify-between p-6 pb-4 border-b border-border">
                  <div>
                    <h2 className="text-xl font-bold">{selectedProject.name}</h2>
                    {selectedProject.client_name && (
                      <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {selectedProject.client_name}
                      </p>
                    )}
                    {dateRange && (
                      <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {dateRange}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate('/invoices', { state: { projectId: selectedProject.id } })}
                      className="gap-1.5"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Go to Timesheet
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => navigate(`/calculator?project=${selectedProject.id}`)}
                      className="gap-1.5"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit in Calculator
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeDetail}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Status selector */}
                <div className="px-6 py-3 border-b border-border flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground mr-1">Status:</span>
                  {(['ongoing', 'finished', 'invoiced', 'paid'] as ProjectStatus[]).map(s => {
                    const cfg = STATUS_CONFIG[s];
                    const isActive = (selectedProject.status ?? 'ongoing') === s;
                    return (
                      <button
                        key={s}
                        disabled={statusUpdating}
                        onClick={() => updateStatus(s)}
                        style={{
                          backgroundColor: isActive ? cfg.badgeBg : 'transparent',
                          color: isActive ? cfg.badgeText : '#6B7280',
                          border: `1px solid ${isActive ? cfg.badgeBorder : '#E5E7EB'}`,
                          borderRadius: '999px',
                          fontSize: '12px',
                          fontWeight: isActive ? 600 : 400,
                          padding: '4px 12px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: isActive ? cfg.calendarBg : '#D1D5DB', display: 'inline-block' }} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>

                <CardContent className="p-6">
                  {daysLoading ? (
                    <p className="text-sm text-muted-foreground">Loading days…</p>
                  ) : projectDays.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">No days saved yet</p>
                      <Button
                        size="sm"
                        className="mt-3 gap-1.5"
                        onClick={() => navigate(`/calculator?project=${selectedProject.id}`)}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Open in Calculator
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {projectDays.map((day, idx) => {
                        const lineItems = day.result_json?.lineItems || [];
                        const penalties = day.result_json?.penalties || [];
                        const travelPay = day.result_json?.travelPay || 0;
                        const mileagePay = day.result_json?.mileage || 0;
                        const sym = getCurrencySymbol(day.calc_engine || selectedProject?.calc_engine);
                        return (
                          <div key={day.id} className="rounded-xl border border-border overflow-hidden">
                            {/* Day header */}
                            <div className="flex items-center justify-between px-4 py-3 bg-muted/40">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-black uppercase tracking-widest text-foreground">Day {idx + 1}</span>
                                  <span className="text-xs text-muted-foreground">{format(parseISO(day.work_date), 'EEE dd MMM yyyy')}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="text-[10px] font-bold tracking-widest uppercase text-[#FFD528] bg-[#1F1F21] px-1.5 py-0.5 rounded">
                                    {DAY_TYPE_SHORT[day.day_type] || DAY_TYPE_LABELS[day.day_type] || day.day_type}
                                  </span>
                                  <span className="text-xs text-muted-foreground">{day.role_name}</span>
                                  {day.call_time && day.wrap_time && (
                                    <span className="text-xs text-muted-foreground font-mono">{day.call_time} – {day.wrap_time}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-3">
                                <p className="text-sm font-bold tabular-nums">{sym}{(day.grand_total || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                <button
                                  onClick={() => removeDay(day.id)}
                                  disabled={deletingDayId === day.id}
                                  className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Remove day"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Line items */}
                            {(lineItems.length > 0 || penalties.length > 0 || travelPay > 0 || mileagePay > 0) && (
                              <div className="px-4 py-2">
                                <div className="grid gap-x-3" style={{ gridTemplateColumns: '1fr auto auto' }}>
                                  {lineItems.filter(Boolean).map((item, i) => {
                                    const isFlatRate = !!(item.rate && Math.abs((item.total ?? 0) - item.rate) < 1);
                                    const isDayRate = item.isDayRate || isFlatRate;
                                    const timePart = item.timeFrom && item.timeTo ? `${item.timeFrom}–${item.timeTo}` : '';
                                    let ratePart = '';
                                    if (item.rate && item.hours) {
                                      ratePart = isDayRate
                                        ? `${sym}${item.total ?? 0} × 1`
                                        : `${sym}${item.rate} × ${parseFloat(item.hours.toFixed(2))}`;
                                    }
                                    const detail = [timePart, ratePart].filter(Boolean).join(' · ');
                                    return (
                                      <Fragment key={i}>
                                        <p className="text-xs text-muted-foreground leading-tight py-[3px] self-center">{item.description}</p>
                                        <span className="text-[10px] text-muted-foreground/50 font-mono text-right self-center py-[3px]">{detail}</span>
                                        <span className="font-mono text-xs font-semibold tabular-nums text-right self-center py-[3px]">{sym}{(item.total ?? 0).toFixed(2)}</span>
                                      </Fragment>
                                    );
                                  })}
                                  {penalties.length > 0 && (
                                    <>
                                      <div className="col-span-3 border-t border-border/40 my-1" />
                                      {penalties.filter(Boolean).map((item, i) => {
                                        const pIsFlatRate = !!(item.rate && Math.abs((item.total ?? 0) - item.rate) < 1);
                                        let pDetail = '';
                                        if (item.rate && item.hours) {
                                          pDetail = pIsFlatRate
                                            ? `${sym}${item.rate} × 1`
                                            : `${sym}${item.rate} × ${parseFloat(item.hours.toFixed(2))}`;
                                        }
                                        return (
                                          <Fragment key={`pen-${i}`}>
                                            <p className="text-xs text-muted-foreground leading-tight py-[3px] self-center">{item.description}</p>
                                            <span className="text-[10px] text-muted-foreground/50 font-mono text-right self-center py-[3px]">{pDetail}</span>
                                            <span className="font-mono text-xs font-semibold tabular-nums text-right self-center py-[3px]">{sym}{(item.total ?? 0).toFixed(2)}</span>
                                          </Fragment>
                                        );
                                      })}
                                    </>
                                  )}
                                  {travelPay > 0 && (
                                    <Fragment key="travel">
                                      <p className="text-xs text-muted-foreground py-[3px] self-center">Travel pay</p>
                                      <span />
                                      <span className="font-mono text-xs font-semibold tabular-nums text-right self-center py-[3px]">{sym}{travelPay.toFixed(2)}</span>
                                    </Fragment>
                                  )}
                                  {mileagePay > 0 && (
                                    <Fragment key="mileage">
                                      <p className="text-xs text-muted-foreground py-[3px] self-center">Mileage ({day.result_json?.mileageMiles || 0} mi)</p>
                                      <span />
                                      <span className="font-mono text-xs font-semibold tabular-nums text-right self-center py-[3px]">{sym}{mileagePay.toFixed(2)}</span>
                                    </Fragment>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Project total */}
                      <div className="flex items-center justify-between rounded-xl bg-[#1F1F21] px-4 py-3 mt-2">
                        <span className="text-sm font-bold text-white">Job Total</span>
                        <span className="text-lg font-bold text-[#FFD528]">
                          {getCurrencySymbol(selectedProject?.calc_engine)}{projectTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex gap-2 mt-1">
                        <Button
                          variant="outline"
                          className="flex-1 gap-2"
                          onClick={() => navigate('/invoices', { state: { projectId: selectedProject.id } })}
                        >
                          <Clock className="h-4 w-4" />
                          Go to Timesheet
                        </Button>
                        <Button
                          className="flex-1 gap-2"
                          onClick={() => navigate(`/calculator?project=${selectedProject.id}`)}
                        >
                          <Edit3 className="h-4 w-4" />
                          Edit in Calculator
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Data is retained for 6 months (free) or 3 years (Pro), in compliance with our data retention policy.
      </p>

      <JobLimitDialog
        open={jobLimitOpen}
        onOpenChange={setJobLimitOpen}
        projects={projects}
        onDeleted={id => setProjects(prev => prev.filter(p => p.id !== id))}
        onProceed={() => navigate('/calculator')}
      />

      {/* ── Share dialog ──────────────────────────────────────────────────── */}
      <Dialog
        open={!!shareDialogProjectId}
        onOpenChange={open => { if (!open) { setShareDialogProjectId(null); setShareRecord(null); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share job</DialogTitle>
            <DialogDescription>
              Share this job's schedule with your crew. They'll set their own role and rate.
            </DialogDescription>
          </DialogHeader>

          {shareDialogLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : shareDialogError ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm font-medium text-destructive">Failed to create share link</p>
              <p className="text-xs text-muted-foreground font-mono">{shareDialogError}</p>
            </div>
          ) : shareRecord ? (
            <div className="space-y-5 py-2">
              {/* Toggles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Include mileage expenses</Label>
                  <Switch
                    checked={shareRecord.includeExpenses}
                    onCheckedChange={v => updateShareToggle('include_expenses', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Include equipment hire</Label>
                  <Switch
                    checked={shareRecord.includeEquipment}
                    onCheckedChange={v => updateShareToggle('include_equipment', v)}
                  />
                </div>
              </div>

              {/* Copy link */}
              <div className="space-y-2">
                <Label>Share link</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={`https://app.crewdock.app/share/${shareRecord.token}`}
                    className="font-mono text-xs"
                    onFocus={e => e.target.select()}
                  />
                  <Button variant="outline" onClick={copyShareLink} className="shrink-0 gap-1.5">
                    {shareLinkCopied ? (
                      <><Check className="h-4 w-4" /> Copied</>
                    ) : (
                      <><Copy className="h-4 w-4" /> Copy</>
                    )}
                  </Button>
                </div>
              </div>

              {/* Stop sharing */}
              <div className="pt-1 border-t">
                <Button
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={stopSharing}
                >
                  Stop sharing
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
