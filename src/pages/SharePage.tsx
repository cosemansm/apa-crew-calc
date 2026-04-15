import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Lock, Clock, AlertCircle, CheckCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as Sentry from '@sentry/react'
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useEngine } from '@/hooks/useEngine';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getEngine, DEFAULT_ENGINE_ID } from '@/engines/index';
import type { CalculatorEngine } from '@/engines/types';
import { APA_CREW_ROLES, DEPARTMENTS, getRolesByDepartment } from '@/data/apa-rates';
import { calculateCrewCost, type DayType, type DayOfWeek } from '@/data/calculation-engine';
import logoSrc from '@/assets/logo.png';

// ── Types matching the API response shape ────────────────────────────────────

interface SharedDay {
  workDate: string;
  dayType: string;
  dayOfWeek: string;
  callTime: string;
  wrapTime: string;
  firstBreakGiven: boolean;
  firstBreakTime: string | null;
  firstBreakDuration: number;
  secondBreakGiven: boolean;
  secondBreakTime: string | null;
  secondBreakDuration: number;
  continuousFirstBreakGiven: boolean;
  continuousAdditionalBreakGiven: boolean;
  travelHours: number;
  previousWrap: string | null;
  isBankHoliday: boolean;
  penalties: Array<{ description: string }>;
  mileage?: number;
  equipmentValue?: number;
  equipmentDiscount?: number;
}

interface ShareData {
  projectName: string;
  calcEngine: string;
  ownerName: string;
  includeExpenses: boolean;
  includeEquipment: boolean;
  days: SharedDay[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_TYPE_LABELS: Record<string, string> = {
  basic_working: 'Shoot Day',
  continuous_working: 'Shoot Day (Continuous)',
  prep: 'Prep Day',
  recce: 'Recce Day',
  build_strike: 'Build/Strike Day',
  pre_light: 'Pre-light Day',
  rest: 'Rest Day',
  travel: 'Travel Day',
};

// ── Component ────────────────────────────────────────────────────────────────

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const { isPremium } = useSubscription();
  const { authorizedEngines } = useEngine();
  const navigate = useNavigate();

  // Data states
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  // Engine states
  const [shareEngine, setShareEngine] = useState<CalculatorEngine | null>(null);
  const [engineError, setEngineError] = useState<'not_found' | 'mismatch' | null>(null);
  const [mismatchDismissed, setMismatchDismissed] = useState(false);
  const [issueReported, setIssueReported] = useState(false);

  // User states (populated after auth is known)
  const [isOwner, setIsOwner] = useState(false);
  const [alreadyImported, setAlreadyImported] = useState(false);
  const [projectCount, setProjectCount] = useState(0);

  // Add-to-jobs dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [agreedRate, setAgreedRate] = useState('');
  const [mileageInput, setMileageInput] = useState('');
  const [equipValueInput, setEquipValueInput] = useState('');
  const [equipDiscountInput, setEquipDiscountInput] = useState('');
  const [importing, setImporting] = useState(false);

  // Fetch share data from API (public — no auth header needed)
  useEffect(() => {
    if (!token) return;
    fetch(`/api/share/${token}`)
      .then(r => r.json())
      .then((data: any) => {
        if (data.error) {
          const debugParts = [data.error];
          if (data.debug_reason) debugParts.push(`reason:${data.debug_reason}`);
          if (data.debug_has_url !== undefined) debugParts.push(`url:${data.debug_has_url}`);
          if (data.debug_has_key !== undefined) debugParts.push(`key:${data.debug_has_key}`);
          if (data.debug_is_active !== undefined) debugParts.push(`is_active:${data.debug_is_active}`);
          if (data.debug_body !== undefined) debugParts.push(`body:${JSON.stringify(data.debug_body)}`);
          setLoadError(debugParts.length > 1 ? debugParts.join(' | ') : 'This link is no longer active.');
        } else {
          const sd = data as ShareData;
          setShareData(sd);
          // Pre-fill optional inputs from first day's values
          if (sd.includeExpenses && sd.days.length > 0) {
            setMileageInput(String(sd.days[0].mileage ?? 0));
          }
          if (sd.includeEquipment && sd.days.length > 0) {
            setEquipValueInput(String(sd.days[0].equipmentValue ?? 0));
            setEquipDiscountInput(String(sd.days[0].equipmentDiscount ?? 0));
          }
        }
      })
      .catch(() => setLoadError('Failed to load shared job.'))
      .finally(() => setDataLoading(false));
  }, [token]);

  // Resolve the calculator engine once share data is loaded
  useEffect(() => {
    if (!shareData) return;
    const calcEngineId = shareData.calcEngine ?? DEFAULT_ENGINE_ID;
    try {
      const resolved = getEngine(calcEngineId);
      setShareEngine(resolved);
    } catch {
      setEngineError('not_found');
      Sentry.captureEvent({
        message: 'Job share engine issue',
        level: 'warning',
        tags: { feature: 'job-sharing', scenario: 'engine_not_found', job_engine: calcEngineId },
      });
    }
  }, [shareData]);

  // Detect engine mismatch for logged-in users
  useEffect(() => {
    if (!shareEngine || !user) return;
    const hasAccess = authorizedEngines.some(e => e.meta.id === shareEngine.meta.id);
    if (hasAccess) {
      // Clear mismatch error if it was set prematurely (EngineContext loads async)
      setEngineError(prev => prev === 'mismatch' ? null : prev);
      return;
    }
    setEngineError('mismatch');
    Sentry.captureEvent({
      message: 'Job share engine issue',
      level: 'warning',
      tags: { feature: 'job-sharing', scenario: 'engine_mismatch', job_engine: shareEngine.meta.id },
      extra: { shareToken: token, viewerEngineAccess: authorizedEngines.map(e => e.meta.id) },
    });
  }, [shareEngine, user, authorizedEngines]);

  // Set page title to job name for share previews (e.g. WhatsApp/iMessage)
  useEffect(() => {
    if (shareData) {
      document.title = `Crew Dock — ${shareData.projectName}`;
    }
    return () => { document.title = 'Crew Dock — APA Crew Rate Calculator'; };
  }, [shareData]);

  // Once auth + shareData are both ready, check owner/import status
  useEffect(() => {
    if (!user || !token || !shareData) return;

    const checkUserState = async () => {
      // Owner check: RLS only returns this row to the owner
      const { data: ownerRow } = await supabase
        .from('shared_jobs')
        .select('id')
        .eq('token', token)
        .maybeSingle();
      setIsOwner(!!ownerRow);

      // Import check: did this user already add this job?
      const { data: importRow } = await supabase
        .from('shared_job_imports')
        .select('id')
        .eq('token', token)
        .maybeSingle();
      setAlreadyImported(!!importRow);

      // Project count for job limit check
      const { count } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setProjectCount(count ?? 0);
    };

    checkUserState().catch(() => {});
  }, [user, token, shareData]);

  // ── Add to my jobs ──────────────────────────────────────────────────────────

  const handleAddToJobs = async () => {
    if (!shareData || !user || !token) return;

    const role = APA_CREW_ROLES.find(r => r.role === selectedRole);
    if (!role) { toast.error('Please select a role'); return; }
    const rate = parseInt(agreedRate, 10);
    if (!rate || rate <= 0) { toast.error('Please enter a valid daily rate'); return; }

    if (!isPremium && projectCount >= 10) {
      toast.error('You\'ve reached the 10-job limit. Upgrade to Pro or delete a job first.');
      return;
    }

    setImporting(true);
    try {
      // 1. Create project in recipient's account
      const { data: newProject, error: projectError } = await supabase
        .from('projects')
        .insert({ user_id: user.id, name: shareData.projectName, status: 'ongoing' })
        .select()
        .single();
      if (projectError || !newProject) throw new Error('Failed to create project');

      // 2. Build and run calculation for each day
      const mileageMiles = shareData.includeExpenses ? (parseFloat(mileageInput) || 0) : 0;
      const equipValue = shareData.includeEquipment ? (parseFloat(equipValueInput) || 0) : 0;
      const equipDiscount = shareData.includeEquipment ? (parseFloat(equipDiscountInput) || 0) : 0;

      const dayRows = shareData.days.map(d => {
        const result = calculateCrewCost({
          role,
          agreedDailyRate: rate,
          dayType: d.dayType as DayType,
          dayOfWeek: d.dayOfWeek as DayOfWeek,
          callTime: d.callTime,
          wrapTime: d.wrapTime,
          firstBreakGiven: d.firstBreakGiven,
          firstBreakTime: d.firstBreakTime ?? undefined,
          firstBreakDurationMins: d.firstBreakDuration,
          secondBreakGiven: d.secondBreakGiven,
          secondBreakTime: d.secondBreakTime ?? undefined,
          secondBreakDurationMins: d.secondBreakDuration,
          continuousFirstBreakGiven: d.continuousFirstBreakGiven,
          continuousAdditionalBreakGiven: d.continuousAdditionalBreakGiven,
          travelHours: d.travelHours,
          mileageOutsideM25: mileageMiles,
          previousWrapTime: d.previousWrap ?? undefined,
          equipmentValue: equipValue,
          equipmentDiscount: equipDiscount,
        });
        return {
          project_id: newProject.id,
          work_date: d.workDate,
          role_name: role.role,
          department: role.department,
          agreed_rate: rate,
          day_type: d.dayType,
          day_of_week: d.dayOfWeek,
          call_time: d.callTime,
          wrap_time: d.wrapTime,
          first_break_given: d.firstBreakGiven,
          first_break_time: d.firstBreakTime,
          first_break_duration: d.firstBreakDuration,
          second_break_given: d.secondBreakGiven,
          second_break_time: d.secondBreakTime,
          second_break_duration: d.secondBreakDuration,
          continuous_first_break_given: d.continuousFirstBreakGiven,
          continuous_additional_break_given: d.continuousAdditionalBreakGiven,
          travel_hours: d.travelHours,
          mileage: mileageMiles,
          previous_wrap: d.previousWrap,
          is_bank_holiday: d.isBankHoliday,
          ...(equipValue ? { equipment_value: equipValue } : {}),
          ...(equipDiscount ? { equipment_discount: equipDiscount } : {}),
          result_json: result,
          grand_total: result.grandTotal,
        };
      });

      const { error: daysError } = await supabase.from('project_days').insert(dayRows);
      if (daysError) throw new Error('Failed to save job days');

      // 3. Record the import so "Already in your jobs" works
      await supabase.from('shared_job_imports').insert({
        token,
        recipient_id: user.id,
        created_project_id: newProject.id,
      });

      setAlreadyImported(true);
      setAddDialogOpen(false);
      toast.success('Job added to your schedule');
      navigate('/projects');
    } catch (err) {
      toast.error(String(err));
    } finally {
      setImporting(false);
    }
  };

  // ── Engine handlers ──────────────────────────────────────────────────────────

  const handleEnableSdymEngine = async () => {
    if (!user) return;
    const { data: profile, error: selectError } = await supabase
      .from('profiles')
      .select('authorized_engines')
      .eq('id', user.id)
      .single();
    if (selectError || !profile) {
      // Can't safely merge engines without knowing current list
      return;
    }
    const current = (profile.authorized_engines as string[]) ?? ['apa-uk'];
    const updated = Array.from(new Set([...current, 'sdym-be']));
    const { error: updateError } = await supabase.from('profiles').update({
      multi_engine_enabled: true,
      authorized_engines: updated,
    }).eq('id', user.id);
    if (updateError) {
      return;
    }
    window.location.reload();
  };

  const handleReportIssue = () => {
    Sentry.captureEvent({
      message: 'Job share engine issue — user reported',
      level: 'warning',
      tags: { feature: 'job-sharing', scenario: engineError ?? 'unknown', job_engine: shareData?.calcEngine ?? 'unknown' },
    });
    setIssueReported(true);
  };

  // ── Render states ────────────────────────────────────────────────────────────

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-2">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/40 mb-2" />
            <p className="font-semibold">{loadError}</p>
            <p className="text-sm text-muted-foreground">The link may have been revoked or the job deleted.</p>
            {user ? (
              <Button className="mt-4 w-full" onClick={() => navigate('/projects')}>Go to My Projects</Button>
            ) : (
              <Button className="mt-4 w-full" asChild><Link to="/login">Sign In</Link></Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!shareData) return null;

  const dateRange = shareData.days.length > 0
    ? `${format(parseISO(shareData.days[0].workDate), 'dd MMM yyyy')}${
        shareData.days.length > 1
          ? ` – ${format(parseISO(shareData.days[shareData.days.length - 1].workDate), 'dd MMM yyyy')}`
          : ''
      }`
    : null;

  // ── Unauthenticated ──────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-muted/30">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-10 w-10 rounded-2xl bg-[#FFD528] flex items-center justify-center overflow-hidden">
            <img src={logoSrc} alt="Crew Dock" className="h-7 w-7 object-contain" style={{ mixBlendMode: 'multiply' }} />
          </div>
          <span className="text-2xl font-bold">Crew Dock</span>
        </div>

        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>{shareData.projectName}</CardTitle>
            {dateRange && (
              <p className="text-sm text-muted-foreground">
                {dateRange} · {shareData.days.length} day{shareData.days.length !== 1 ? 's' : ''}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{shareData.ownerName}</span> wants to share this job with you
            </p>

            <Button
              className="w-full bg-[#FFD528] hover:bg-[#FFD528]/90 text-[#1F1F21] font-semibold"
              onClick={() => {
                sessionStorage.setItem('pendingShareRedirect', `/share/${token}`);
                navigate('/login');
              }}
            >
              Create a free account or sign in
            </Button>

            {/* Blurred preview */}
            <div className="relative select-none pointer-events-none rounded-xl overflow-hidden">
              <div className="space-y-2 blur-sm opacity-60 px-1">
                {shareData.days.slice(0, 3).map((d, i) => (
                  <div key={i} className="p-3 rounded-lg bg-muted text-sm">
                    <p className="font-medium">
                      {format(parseISO(d.workDate), 'EEE dd MMM')} — {DAY_TYPE_LABELS[d.dayType] ?? d.dayType}
                    </p>
                    <p className="text-muted-foreground">Call {d.callTime} – Wrap {d.wrapTime}</p>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 rounded-xl">
                <Lock className="h-5 w-5 mb-2" />
                <p className="text-sm font-medium text-center px-6">Sign in to view this job and add it to your schedule</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Owner view ───────────────────────────────────────────────────────────────

  if (isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-2">
            <CheckCircle className="h-12 w-12 mx-auto text-[#FFD528] mb-2" />
            <p className="font-semibold">This is your own shared job</p>
            <p className="text-sm text-muted-foreground">You created this link. Manage it from your Projects page.</p>
            <Button className="mt-4 w-full" onClick={() => navigate('/projects')}>Go to My Projects</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Recipient view ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-2xl mx-auto space-y-6 pb-12">
        {/* Mini header */}
        <div className="flex items-center gap-2 pt-4">
          <div className="h-8 w-8 rounded-xl bg-[#FFD528] flex items-center justify-center overflow-hidden">
            <img src={logoSrc} alt="Crew Dock" className="h-5 w-5 object-contain" style={{ mixBlendMode: 'multiply' }} />
          </div>
          <span className="font-bold">Crew Dock</span>
        </div>

        <div>
          <h1 className="text-2xl font-bold">{shareData.projectName}</h1>
          {dateRange && (
            <p className="text-muted-foreground">
              {dateRange} · {shareData.days.length} day{shareData.days.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Engine error states */}
        {engineError === 'not_found' && (
          <div className="text-center space-y-4 py-8">
            <p className="text-sm text-muted-foreground">
              This job uses a calculator engine that is no longer available. Saved figures shown below.
            </p>
            <Button variant="outline" size="sm" onClick={handleReportIssue}>Report issue</Button>
          </div>
        )}

        {engineError === 'mismatch' && shareEngine && !mismatchDismissed && (
          <div className="rounded-lg border p-4 space-y-3 mb-6">
            <p className="text-sm">
              This job uses {shareEngine.meta.name} ({shareEngine.meta.currencySymbol}).
              Enable the Sodyum engine to recalculate.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleEnableSdymEngine}>Enable Sodyum Engine</Button>
              <Button variant="outline" size="sm" onClick={() => setMismatchDismissed(true)}>View anyway</Button>
              <Button variant="ghost" size="sm" onClick={handleReportIssue}>Report issue</Button>
            </div>
          </div>
        )}

        {issueReported && (
          <p className="text-sm text-muted-foreground">
            Thanks — this has been flagged and we'll look into it.
          </p>
        )}

        {/* Days */}
        <div className="space-y-3">
          {shareData.days.map((d, i) => (
            <Card key={i}>
              <CardContent className="py-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{format(parseISO(d.workDate), 'EEE dd MMM yyyy')}</p>
                  <span className="text-sm text-muted-foreground">{DAY_TYPE_LABELS[d.dayType] ?? d.dayType}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Call {d.callTime} – Wrap {d.wrapTime}
                  </span>
                  {d.travelHours > 0 && (
                    <span>+{d.travelHours}h travel</span>
                  )}
                </div>
                {d.penalties.length > 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Penalties: {d.penalties.map(p => p.description).join(', ')}
                  </div>
                )}
                {shareData.includeExpenses && (d.mileage ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">{d.mileage} miles outside M25</p>
                )}
                {shareData.includeEquipment && (d.equipmentValue ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Equipment: {shareEngine?.meta.currencySymbol ?? '£'}{d.equipmentValue} ({d.equipmentDiscount}% discount)
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA */}
        {alreadyImported ? (
          <Button disabled className="w-full gap-2">
            <Check className="h-4 w-4" /> Already in your projects
          </Button>
        ) : (
          <Button
            className="w-full bg-[#FFD528] hover:bg-[#FFD528]/90 text-[#1F1F21] font-semibold"
            onClick={() => setAddDialogOpen(true)}
          >
            Add to my projects
          </Button>
        )}
      </div>

      {/* Add to my projects dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to my projects</DialogTitle>
            <DialogDescription>
              Select your role and rate. The schedule will be pre-filled from the shared project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="share-role">Your role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger id="share-role">
                  <SelectValue placeholder="Select a role…" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(dept => {
                    const roles = getRolesByDepartment(dept);
                    if (!roles.length) return null;
                    return (
                      <SelectGroup key={dept}>
                        <SelectLabel>{dept}</SelectLabel>
                        {roles.map(r => (
                          <SelectItem key={r.role} value={r.role}>{r.role}</SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="share-rate">Your agreed daily rate ({shareEngine?.meta.currencySymbol ?? '£'})</Label>
              <Input
                id="share-rate"
                type="number"
                min="1"
                placeholder="e.g. 650"
                value={agreedRate}
                onChange={e => setAgreedRate(e.target.value)}
              />
            </div>

            {shareData.includeExpenses && (
              <div className="space-y-2">
                <Label htmlFor="share-mileage">Mileage outside M25 (miles)</Label>
                <Input
                  id="share-mileage"
                  type="number"
                  min="0"
                  value={mileageInput}
                  onChange={e => setMileageInput(e.target.value)}
                />
              </div>
            )}

            {shareData.includeEquipment && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="share-equip-value">Equipment hire value ({shareEngine?.meta.currencySymbol ?? '£'})</Label>
                  <Input
                    id="share-equip-value"
                    type="number"
                    min="0"
                    value={equipValueInput}
                    onChange={e => setEquipValueInput(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="share-equip-discount">Equipment discount (%)</Label>
                  <Input
                    id="share-equip-discount"
                    type="number"
                    min="0"
                    max="100"
                    value={equipDiscountInput}
                    onChange={e => setEquipDiscountInput(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#FFD528] hover:bg-[#FFD528]/90 text-[#1F1F21] font-semibold"
              onClick={handleAddToJobs}
              disabled={importing || !selectedRole || !agreedRate}
            >
              {importing ? 'Adding…' : 'Add to my projects'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
