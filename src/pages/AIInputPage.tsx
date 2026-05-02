import { useState, useMemo, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { ProLockOverlay } from '@/components/ProLockOverlay';
import {
  Sparkles, Send, Loader2, AlertCircle, ChevronLeft, ChevronRight,
  CheckCircle2, Save, TriangleAlert, CalendarIcon, Star, MessageSquare, RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { APA_CREW_ROLES, getRolesByDepartment } from '@/data/apa-rates';
import { calculateCrewCost, type DayType, type DayOfWeek } from '@/data/calculation-engine';
import { parseTimesheetWithGemini, embedText, type ParsedEntry } from '@/lib/gemini';
import { classifyInput } from '@/lib/classify-input';
import { rankChunks, type TCChunk } from '@/lib/tc-search';
import { askTCQuestion, type ChatMessage, type TCAnswer } from '@/lib/tc-chat';
import { supabase } from '@/lib/supabase';
import { useEngine } from '@/hooks/useEngine';
import { useAuth } from '@/contexts/AuthContext';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, isSameDay, isSameMonth, parseISO, getDay,
} from 'date-fns';
import { cn } from '@/lib/utils';
// Lazy-load the 1.5MB embeddings JSON only when a T&C question is asked
let tcChunksCache: TCChunk[] | null = null;
async function getTCChunks(): Promise<TCChunk[]> {
  if (!tcChunksCache) {
    const { default: data } = await import('@/data/apa-tc-chunks.json');
    tcChunksCache = data as TCChunk[];
  }
  return tcChunksCache;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_TYPE_OPTIONS: { value: DayType; label: string }[] = [
  { value: 'basic_working',      label: 'Basic Working Day (Shoot)' },
  { value: 'continuous_working', label: 'Continuous Working Day' },
  { value: 'prep',               label: 'Prep Day' },
  { value: 'recce',              label: 'Recce Day' },
  { value: 'build_strike',       label: 'Build / Strike Day' },
  { value: 'pre_light',          label: 'Pre-light Day' },
  { value: 'travel',             label: 'Travel Day' },
  { value: 'rest',               label: 'Rest Day' },
];


const WEEK_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Standard flat-day hours per day type (used to auto-calculate wrap from call)
const DEFAULT_WRAP_HOURS: Partial<Record<DayType, number>> = {
  basic_working: 11,
  continuous_working: 9,
  prep: 8,
  recce: 8,
  build_strike: 8,
  pre_light: 9,
  travel: 5,
  // rest: no times needed
};

function addHoursToTime(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMins = h * 60 + m + Math.round(hours * 60);
  return `${String(Math.floor(totalMins / 60) % 24).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
}

type Stage = 'input' | 'review' | 'chat';

interface EditableEntry extends ParsedEntry {
  _id: string;
}

// ─── Custom Date Picker ───────────────────────────────────────────────────────

function DatePickerField({
  value, onChange, missing,
}: {
  value: string;
  onChange: (date: string, dow: DayOfWeek) => void;
  missing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    value ? new Date(value) : new Date()
  );

  const today = new Date();
  const selected = value ? parseISO(value) : null;

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Monday-first offset
  const startOffset = (getDay(monthStart) + 6) % 7;

  const handleSelect = (d: Date) => {
    const iso = format(d, 'yyyy-MM-dd');
    const dowMap: DayOfWeek[] = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const dow = dowMap[d.getDay()];
    onChange(iso, dow);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-11 w-full items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm text-left transition-colors',
            'hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/20',
            !value && 'text-muted-foreground',
            missing && 'ring-2 ring-[#FFD528]',
          )}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          {value ? format(parseISO(value), 'd MMM yyyy') : 'Pick a date…'}
        </button>
      </PopoverTrigger>

      <PopoverContent className="p-4 w-72">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewMonth(m => subMonths(m, 1))}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">{format(viewMonth, 'MMMM yyyy')}</span>
          <button
            type="button"
            onClick={() => setViewMonth(m => addMonths(m, 1))}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Week headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEK_HEADERS.map(h => (
            <div key={h} className="h-8 flex items-center justify-center text-[11px] font-medium text-muted-foreground">
              {h}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-y-1">
          {/* Leading empty cells */}
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map(d => {
            const isToday = isSameDay(d, today);
            const isSelected = selected ? isSameDay(d, selected) : false;
            const isCurrentMonth = isSameMonth(d, viewMonth);
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => handleSelect(d)}
                className={cn(
                  'h-8 w-8 mx-auto flex items-center justify-center rounded-lg text-sm transition-colors',
                  !isCurrentMonth && 'opacity-30',
                  isSelected && 'bg-[#FFD528] text-[#1F1F21] font-bold',
                  isToday && !isSelected && 'bg-[#1F1F21] text-white font-bold',
                  !isSelected && !isToday && 'hover:bg-muted',
                )}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>

        {/* Today shortcut */}
        <div className="mt-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => handleSelect(today)}
            className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
          >
            Today — {format(today, 'd MMM yyyy')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Role Select with grouped options ────────────────────────────────────────

function RoleSelect({
  value, onChange, missing,
  favouriteRoles, userDepartment,
}: {
  value: string;
  onChange: (v: string) => void;
  missing?: boolean;
  favouriteRoles: string[];
  userDepartment: string;
}) {
  const deptRoles = useMemo(() => {
    if (!userDepartment) return [];
    return getRolesByDepartment(userDepartment)
      .map(r => r.role)
      .filter(r => !favouriteRoles.includes(r));
  }, [userDepartment, favouriteRoles]);

  const otherRoles = useMemo(() => {
    const used = new Set([...favouriteRoles, ...deptRoles]);
    return APA_CREW_ROLES.map(r => r.role).filter(r => !used.has(r));
  }, [favouriteRoles, deptRoles]);

  return (
    <div className={cn(missing && 'ring-2 ring-[#FFD528] rounded-xl')}>
      <Select
        value={value || '__none__'}
        onValueChange={v => onChange(v === '__none__' ? '' : v)}
      >
        <SelectTrigger className={cn('text-sm', !value && 'text-muted-foreground')}>
          <SelectValue placeholder="Select a role…" />
        </SelectTrigger>
        <SelectContent className="max-h-72">

          {/* Favourites */}
          {favouriteRoles.length > 0 && (
            <SelectGroup>
              <SelectLabel className="flex items-center gap-1.5 text-[11px] text-amber-600">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> Favourites
              </SelectLabel>
              {favouriteRoles.map(r => (
                <SelectItem key={`fav-${r}`} value={r} className="text-sm">{r}</SelectItem>
              ))}
            </SelectGroup>
          )}

          {/* My Department */}
          {deptRoles.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[11px] text-muted-foreground">
                My Department — {userDepartment}
              </SelectLabel>
              {deptRoles.map(r => (
                <SelectItem key={`dept-${r}`} value={r} className="text-sm">{r}</SelectItem>
              ))}
            </SelectGroup>
          )}

          {/* All other roles */}
          <SelectGroup>
            <SelectLabel className="text-[11px] text-muted-foreground">All Roles</SelectLabel>
            {otherRoles.map(r => (
              <SelectItem key={r} value={r} className="text-sm">{r}</SelectItem>
            ))}
          </SelectGroup>

        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Missing field wrapper ────────────────────────────────────────────────────

function FieldWrap({ label, missing, children, className }: {
  label: string; missing?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-1.5">
        <Label className="text-xs">{label}</Label>
        {missing && <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Required</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AIInputPage() {
  usePageTitle('AI Assistant');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { defaultEngineId } = useEngine();

  const [stage, setStage] = useState<Stage>('input');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<EditableEntry[]>([]);
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // User context for role sorting
  const [favouriteRoles, setFavouriteRoles] = useState<string[]>([]);
  const [userDepartment, setUserDepartment] = useState('');

  // Chat state
  const [chatMessages, setChatMessages] = useState<(ChatMessage & { sections?: string[] })[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('favourite_roles').select('role_name').eq('user_id', user.id)
      .then(({ data }) => { if (data) setFavouriteRoles(data.map(r => r.role_name)); }, () => {});
    supabase.from('user_settings').select('department').eq('user_id', user.id).single()
      .then(({ data }) => { if (data?.department) setUserDepartment(data.department); }, () => {});
  }, [user]);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);

    const intent = classifyInput(input);

    if (intent === 'question') {
      // Route to chat
      const question = input;
      setChatMessages([{ role: 'user', content: question }]);
      setChatInput('');
      setInput('');
      setStage('chat');
      setChatLoading(true);
      setLoading(false);

      try {
        const queryEmbedding = await embedText(input);
        const chunks = await getTCChunks();
        const relevantChunks = rankChunks(queryEmbedding, chunks, 5);
        const answer = await askTCQuestion(input, relevantChunks, []);
        setChatMessages(prev => [...prev, { role: 'assistant', content: answer.content, sections: answer.sections }]);
      } catch (err) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I couldn't process that question. ${err instanceof Error ? err.message : 'Please try again.'}` }]);
      } finally {
        setChatLoading(false);
      }
      return;
    }

    // Timesheet flow (existing)
    try {
      const parsed = await parseTimesheetWithGemini(input);
      setEntries(parsed.map((e, i) => {
        const entry: EditableEntry = { ...e, _id: `entry-${i}-${Date.now()}` };
        if (!entry.callTime) {
          entry.callTime = '08:00';
          entry.missingFields = entry.missingFields.filter(f => f !== 'callTime');
        }
        if (entry.dayType === 'rest') {
          entry.missingFields = entry.missingFields.filter(f => f !== 'callTime' && f !== 'wrapTime');
        } else if (!entry.wrapTime) {
          const hours = DEFAULT_WRAP_HOURS[entry.dayType];
          if (hours !== undefined) {
            entry.wrapTime = addHoursToTime(entry.callTime, hours);
            entry.missingFields = entry.missingFields.filter(f => f !== 'wrapTime');
          }
        }
        return entry;
      }));
      setProjectName('');
      setStage('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleChatFollowUp = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const question = chatInput;
    setChatInput('');
    const history: ChatMessage[] = [
      ...chatMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ];
    setChatMessages(prev => [...prev, { role: 'user', content: question }]);
    setChatLoading(true);

    try {

      const queryEmbedding = await embedText(question);
      const chunks = await getTCChunks();
      const relevantChunks = rankChunks(queryEmbedding, chunks, 5);
      const answer = await askTCQuestion(question, relevantChunks, history);
      setChatMessages(prev => [...prev, { role: 'assistant', content: answer.content, sections: answer.sections }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, something went wrong. ${err instanceof Error ? err.message : 'Please try again.'}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Update entry ───────────────────────────────────────────────────────────

  const updateEntry = (id: string, patch: Partial<EditableEntry>) => {
    setEntries(prev => prev.map(e => {
      if (e._id !== id) return e;
      const updated = { ...e, ...patch };

      // Auto-fill rate when role is selected and rate is missing/zero
      if (patch.role && patch.role !== e.role) {
        const roleData = APA_CREW_ROLES.find(r => r.role === patch.role);
        if (roleData && (!updated.agreedRate || updated.agreedRate === 0)) {
          updated.agreedRate = roleData.maxRate ?? 0;
        }
      }

      const fieldMap: Record<string, string> = {
        role: 'role', agreedRate: 'rate', workDate: 'date',
        callTime: 'callTime', wrapTime: 'wrapTime',
      };
      const resolvedMissing = Object.keys(patch).map(k => fieldMap[k]).filter(Boolean);

      // If role was set and rate is now populated, also clear 'rate' from missing
      if (patch.role && updated.agreedRate > 0) resolvedMissing.push('rate');

      updated.missingFields = updated.missingFields.filter(f => !resolvedMissing.includes(f));
      return updated;
    }));
  };

  // ── Global role/rate — apply once to all days missing that field ───────────

  const anyMissingRole = entries.some(e => e.missingFields.includes('role'));
  const anyMissingRate = entries.some(e => e.missingFields.includes('rate'));

  const applyGlobalRole = (role: string) => {
    const roleData = APA_CREW_ROLES.find(r => r.role === role);
    setEntries(prev => prev.map(e => {
      if (!e.missingFields.includes('role')) return e;
      const updated = { ...e, role };
      // Also fill rate from role default if still missing
      if (roleData && (!updated.agreedRate || updated.agreedRate === 0)) {
        updated.agreedRate = roleData.maxRate ?? 0;
      }
      updated.missingFields = updated.missingFields.filter(
        f => f !== 'role' && (updated.agreedRate > 0 ? f !== 'rate' : true)
      );
      return updated;
    }));
  };

  const applyGlobalRate = (rate: number) => {
    setEntries(prev => prev.map(e => {
      if (!e.missingFields.includes('rate')) return e;
      return { ...e, agreedRate: rate, missingFields: e.missingFields.filter(f => f !== 'rate') };
    }));
  };

  // ── Auto-calculate ─────────────────────────────────────────────────────────

  const results = useMemo(() => {
    return entries.map(entry => {
      if (!entry.role || !entry.agreedRate || !entry.callTime || !entry.wrapTime) return null;
      const role = APA_CREW_ROLES.find(r => r.role === entry.role);
      if (!role) return null;
      try {
        return calculateCrewCost({
          role,
          agreedDailyRate: entry.agreedRate,
          dayType: entry.dayType,
          dayOfWeek: entry.dayOfWeek,
          callTime: entry.callTime,
          wrapTime: entry.wrapTime,
          firstBreakGiven: true,
          firstBreakDurationMins: entry.dayType === 'continuous_working' ? 30 : 60,
          secondBreakGiven: entry.dayType !== 'continuous_working',
          secondBreakDurationMins: 30,
          continuousFirstBreakGiven: entry.dayType === 'continuous_working',
          continuousAdditionalBreakGiven: entry.dayType === 'continuous_working',
          travelHours: 0,
          mileageOutsideM25: 0,
        });
      } catch { return null; }
    });
  }, [entries]);

  const totalMissing = entries.reduce((sum, e) => sum + e.missingFields.length, 0);
  const grandTotal = results.reduce((sum, r) => sum + (r?.grandTotal ?? 0), 0);
  const allCalculated = results.length > 0 && results.every(r => r !== null);

  // ── Save project ───────────────────────────────────────────────────────────

  const handleSaveProject = async () => {
    if (!user) return;
    setSaving(true);
    setSaveError(null);

    const { data: project, error: projErr } = await supabase
      .from('projects')
      .insert({ user_id: user.id, name: projectName.trim() || 'AI Import', calc_engine: defaultEngineId })
      .select().single();

    if (projErr || !project) {
      setSaveError(projErr?.message ?? 'Could not create project');
      setSaving(false);
      return;
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const result = results[i];
      const role = APA_CREW_ROLES.find(r => r.role === entry.role);
      const { error: dayErr } = await supabase.from('project_days').insert({
        project_id: project.id,
        day_number: i + 1,
        work_date: entry.workDate || new Date().toISOString().split('T')[0],
        role_name: entry.role,
        department: role?.department ?? '',
        agreed_rate: entry.agreedRate,
        day_type: entry.dayType,
        day_of_week: entry.dayOfWeek,
        call_time: entry.callTime || '08:00',
        wrap_time: entry.wrapTime || '18:00',
        is_bank_holiday: entry.dayOfWeek === 'bank_holiday',
        first_break_given: true,
        first_break_time: '13:00',
        first_break_duration: entry.dayType === 'continuous_working' ? 30 : 60,
        second_break_given: entry.dayType !== 'continuous_working',
        second_break_time: '17:00',
        second_break_duration: 30,
        continuous_first_break_given: entry.dayType === 'continuous_working',
        continuous_additional_break_given: entry.dayType === 'continuous_working',
        travel_hours: 0,
        mileage: 0,
        grand_total: result?.grandTotal ?? 0,
        result_json: result ?? null,
      });
      if (dayErr) Sentry.captureException(new Error(dayErr.message), { extra: { context: 'AIInputPage project_days insert', dayNumber: i + 1, supabaseError: dayErr } });
    }

    setSaving(false);
    navigate(`/calculator?project=${project.id}&name=${encodeURIComponent(projectName.trim() || 'AI Import')}`);
  };

  // ─── Input stage ──────────────────────────────────────────────────────────

  if (stage === 'input') {
    return (
      <ProLockOverlay
        featureName="AI Input"
        featureDescription="Describe your day in plain text and let AI fill in the calculator automatically."
      >
        <div className="max-w-3xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> AI Assistant
            </CardTitle>
            <CardDescription>
              Enter a timesheet in plain English or ask any question about the APA Terms &amp; Conditions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder={`Just type what you know:\n\n"Call 0800 wrap 1700 + 2h OT"\n"Gaffer, Monday, 6am–9pm, £568"\n"3 day shoot as DoP at £1200. Mon–Wed, call 0730, wrap around 2000"\n"Saturday night shoot as Sound Mixer. Called 6pm, wrapped 5am."`}
              className="min-h-[180px] text-sm"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
            />
            <div className="flex gap-2 items-center">
              <Button onClick={handleSubmit} disabled={loading || !input.trim()}>
                {loading
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing…</>
                  : <><Send className="h-4 w-4 mr-1" /> Send</>
                }
              </Button>
              <Button variant="outline" onClick={() => navigate('/calculator')}>Manual Calculator</Button>
            </div>
            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Try an example</CardTitle>
            <CardDescription>Click any example to load it</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Timesheet entries</p>
              <div className="space-y-2">
                {[
                  'Call 0800 wrap 1700 + 2h OT',
                  'I was a Focus Puller on Monday at £558. Called at 7am, wrapped at 10pm.',
                  '2 day shoot as Gaffer at £568. Monday 0800\u20132100, Tuesday 0700\u20131900 continuous day.',
                ].map((example, i) => (
                  <button
                    key={`ts-${i}`}
                    className="w-full text-left p-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/50 hover:border-[#1F1F21]/20 transition-all"
                    onClick={() => setInput(example)}
                  >
                    &quot;{example}&quot;
                  </button>
                ))}
              </div>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Ask about APA T&amp;Cs</p>
              <div className="space-y-2">
                {[
                  'What overtime grade is a Gaffer?',
                  'How do cancellation fees work for a 4-day shoot?',
                  'What happens if my first break is missed?',
                  'How much mileage can I claim outside the M25?',
                ].map((example, i) => (
                  <button
                    key={`qa-${i}`}
                    className="w-full text-left p-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/50 hover:border-[#1F1F21]/20 transition-all"
                    onClick={() => setInput(example)}
                  >
                    &quot;{example}&quot;
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        </div>
      </ProLockOverlay>
    );
  }

  // ─── Chat stage ──────────────────────────────────────────────────────────

  if (stage === 'chat') {
    return (
      <ProLockOverlay
        featureName="AI Assistant"
        featureDescription="Ask questions about APA T&Cs or enter timesheets in plain text."
      >
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setStage('input'); setChatMessages([]); setInput(''); }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <MessageSquare className="h-5 w-5" /> APA T&amp;C Assistant
              </h2>
              <p className="text-sm text-muted-foreground">
                Answers based on the APA Recommended Terms 2025
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setChatMessages([]); setChatInput(''); setStage('input'); }}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> New chat
            </Button>
          </div>

          {/* Messages */}
          <div className="space-y-3">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-start' : 'justify-end',
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
                    msg.role === 'user'
                      ? 'bg-muted text-foreground'
                      : 'bg-[#1F1F21] text-white',
                  )}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.role === 'assistant' && msg.sections && msg.sections.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-white/10 flex flex-wrap gap-1.5">
                      {msg.sections.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/10 text-[11px] font-medium text-white/70"
                        >
                          S.{s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {chatLoading && (
              <div className="flex justify-end">
                <div className="bg-[#1F1F21] rounded-2xl px-4 py-3 flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-[#FFD528] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-[#FFD528] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-[#FFD528] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-white/50">Checking the T&amp;Cs...</span>
                </div>
              </div>
            )}
          </div>

          {/* Follow-up input */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Ask a follow-up question..."
                  className="min-h-[60px] text-sm flex-1 resize-none"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleChatFollowUp(); }}
                />
                <Button
                  onClick={handleChatFollowUp}
                  disabled={chatLoading || !chatInput.trim()}
                  className="self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 text-center">
                This feature is still in development and may produce inaccurate information. Always verify answers yourself.
              </p>
            </CardContent>
          </Card>
        </div>
      </ProLockOverlay>
    );
  }

  // ─── Review stage ─────────────────────────────────────────────────────────

  return (
    <ProLockOverlay
      featureName="AI Input"
      featureDescription="Describe your day in plain text and let AI fill in the calculator automatically."
    >
      <div className="max-w-3xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setStage('input')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-bold">Review & Complete</h2>
          <p className="text-sm text-muted-foreground">
            {entries.length} day{entries.length !== 1 ? 's' : ''} detected — fill in any highlighted fields
          </p>
        </div>
      </div>

      {/* Global fields — job name, role & rate asked once for all days */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Job Name</Label>
            <Input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="e.g. Nike Summer Campaign"
            />
          </div>

          {(anyMissingRole || anyMissingRate) && (
            <div className="grid grid-cols-2 gap-3">
              {anyMissingRole && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Crew Role <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide ml-1">Apply to all</span>
                  </Label>
                  <RoleSelect
                    value=""
                    onChange={applyGlobalRole}
                    missing
                    favouriteRoles={favouriteRoles}
                    userDepartment={userDepartment}
                  />
                </div>
              )}
              {anyMissingRate && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Day Rate (£) <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide ml-1">Apply to all</span>
                  </Label>
                  <div className="relative ring-2 ring-[#FFD528] rounded-xl">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">£</span>
                    <Input
                      type="number"
                      className="pl-7 text-sm"
                      placeholder="0"
                      onChange={e => { const v = parseFloat(e.target.value); if (v > 0) applyGlobalRate(v); }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status banner */}
      {totalMissing > 0 ? (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          <span>
            <strong>{totalMissing} field{totalMissing !== 1 ? 's' : ''} still needed</strong>
            {' '}— highlighted in yellow below.
          </span>
        </div>
      ) : allCalculated ? (
        <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span><strong>All fields complete</strong> — ready to save.</span>
        </div>
      ) : null}

      {/* Entry cards */}
      {entries.map((entry, i) => {
        const result = results[i];
        const isMissing = (f: string) => entry.missingFields.includes(f as never);

        return (
          <Card key={entry._id} className={cn(entry.missingFields.length > 0 && 'border-amber-200')}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-[#1F1F21] flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-white">{i + 1}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{entry.role || 'Unknown role'}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.callTime && entry.wrapTime ? `${entry.callTime} – ${entry.wrapTime}` : 'Times not set'}
                      {entry.workDate && ` · ${format(parseISO(entry.workDate), 'd MMM yyyy')}`}
                    </p>
                  </div>
                </div>
                {result
                  ? <p className="font-bold text-base">£{result.grandTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
                  : <Badge variant="secondary" className="text-xs">Incomplete</Badge>
                }
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Role + Rate */}
              <div className="grid grid-cols-2 gap-3">
                <FieldWrap label="Crew Role" missing={isMissing('role')}>
                  <RoleSelect
                    value={entry.role}
                    onChange={v => updateEntry(entry._id, { role: v })}
                    missing={isMissing('role')}
                    favouriteRoles={favouriteRoles}
                    userDepartment={userDepartment}
                  />
                </FieldWrap>
                <FieldWrap label="Agreed Daily Rate (£)" missing={isMissing('rate')}>
                  <div className={cn('relative', isMissing('rate') && 'ring-2 ring-[#FFD528] rounded-xl')}>
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">£</span>
                    <Input
                      type="number"
                      className="pl-7 text-sm"
                      value={entry.agreedRate || ''}
                      placeholder={entry.role ? String(APA_CREW_ROLES.find(r => r.role === entry.role)?.maxRate ?? '') : '0'}
                      onChange={e => updateEntry(entry._id, { agreedRate: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </FieldWrap>
              </div>

              {/* Call + Wrap */}
              <div className="grid grid-cols-2 gap-3">
                <FieldWrap label="Call Time" missing={isMissing('callTime')}>
                  <div className={cn(isMissing('callTime') && 'ring-2 ring-[#FFD528] rounded-xl')}>
                    <Input type="time" className="text-sm" value={entry.callTime || ''}
                      onChange={e => updateEntry(entry._id, { callTime: e.target.value })} />
                  </div>
                </FieldWrap>
                <FieldWrap label="Wrap Time" missing={isMissing('wrapTime')}>
                  <div className={cn(isMissing('wrapTime') && 'ring-2 ring-[#FFD528] rounded-xl')}>
                    <Input type="time" className="text-sm" value={entry.wrapTime || ''}
                      onChange={e => updateEntry(entry._id, { wrapTime: e.target.value })} />
                  </div>
                </FieldWrap>
              </div>

              {/* Date + Day Type */}
              <div className="grid grid-cols-2 gap-3">
                <FieldWrap label="Work Date" missing={isMissing('date')}>
                  <DatePickerField
                    value={entry.workDate || ''}
                    missing={isMissing('date')}
                    onChange={(date, dow) => updateEntry(entry._id, { workDate: date, dayOfWeek: dow })}
                  />
                </FieldWrap>
                <FieldWrap label="Day Type">
                  <Select value={entry.dayType} onValueChange={v => updateEntry(entry._id, { dayType: v as DayType })}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAY_TYPE_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrap>
              </div>

              {entry.notes && (
                <p className="text-xs text-muted-foreground italic px-1">{entry.notes}</p>
              )}

              {/* Breakdown */}
              {result && (result.lineItems.length > 0 || result.penalties.length > 0) && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    {result.lineItems.filter(Boolean).map((item, j) => (
                      <div key={j} className="flex justify-between text-xs text-muted-foreground">
                        <span>{item.description}</span>
                        <span className="font-medium text-foreground">£{(item.total ?? 0).toFixed(2)}</span>
                      </div>
                    ))}
                    {result.penalties.filter(Boolean).map((item, j) => (
                      <div key={`pen-${j}`} className="flex justify-between text-xs text-orange-600">
                        <span>{item.description}</span>
                        <span className="font-medium">£{(item.total ?? 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Total + Save */}
      <Card className="bg-[#1F1F21] border-[#1F1F21]">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-semibold">Total ({entries.length} day{entries.length !== 1 ? 's' : ''})</span>
            <span className="text-2xl font-bold text-[#FFD528]">
              £{grandTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <Separator className="bg-white/10" />

          {saveError && (
            <div className="p-3 bg-red-500/20 border border-red-400/30 rounded-xl text-sm text-red-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}

          <Button
            className="w-full bg-[#FFD528] text-[#1F1F21] hover:brightness-105 font-bold"
            onClick={handleSaveProject}
            disabled={saving || !projectName.trim()}
          >
            {saving
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
              : <><Save className="h-4 w-4 mr-2" /> Save as Job & Open in Calculator</>
            }
          </Button>
          <p className="text-xs text-white/40 text-center">
            Fine-tune breaks, penalties and equipment in the calculator
          </p>
        </CardContent>
      </Card>
    </div>
    </ProLockOverlay>
  );
}
