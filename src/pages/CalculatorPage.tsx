import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Save, RotateCcw, PoundSterling, CalendarDays, Star, Plus, FileText as InvoiceIcon, ChevronLeft, ChevronRight, Pencil, FolderOpen } from 'lucide-react';
import { format, getDay, addDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from 'date-fns';
import { APA_CREW_ROLES, DEPARTMENTS, getRolesByDepartment, type CrewRole } from '@/data/apa-rates';
import { calculateCrewCost, type DayType, type DayOfWeek, type CalculationResult } from '@/data/calculation-engine';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const DAY_TYPES: { value: DayType; label: string }[] = [
  { value: 'basic_working', label: 'Basic Working Day (Shoot Day)' },
  { value: 'continuous_working', label: 'Continuous Working Day' },
  { value: 'prep', label: 'Prep Day' },
  { value: 'recce', label: 'Recce Day' },
  { value: 'build_strike', label: 'Build / Strike Day' },
  { value: 'pre_light', label: 'Pre-light Day' },
  { value: 'rest', label: 'Rest Day' },
  { value: 'travel', label: 'Travel Day' },
];

const JS_DAY_TO_DOW: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
  bank_holiday: 'Bank Holiday',
};

function dateToDayOfWeek(dateStr: string): DayOfWeek {
  const date = new Date(dateStr + 'T12:00:00');
  return JS_DAY_TO_DOW[getDay(date)];
}

function addHoursToTime(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMins = h * 60 + m + Math.round(hours * 60);
  const newH = Math.floor(totalMins / 60) % 24;
  const newM = totalMins % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

// Default day duration for each type, used to auto-set wrap time on day type change
const DEFAULT_WRAP_HOURS: Partial<Record<DayType, number>> = {
  basic_working: 11,     // 10h working + 1h lunch
  continuous_working: 9, // 9h continuous (no lunch)
  prep: 8,               // 8h base
  recce: 8,
  build_strike: 8,
  pre_light: 9,          // 8h + 1h lunch included
  travel: 5,             // min 5h per APA S.3.1 / S.2.4(xiii)(xiv)
  // rest: no default — flat fee, times irrelevant
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

function TimePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [h, m] = value.split(':');
  const snappedMin = MINUTES.reduce((prev, curr) =>
    Math.abs(parseInt(curr) - parseInt(m)) < Math.abs(parseInt(prev) - parseInt(m)) ? curr : prev
  );
  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <div className="flex items-center gap-1">
        <Select value={h} onValueChange={v => onChange(`${v}:${snappedMin}`)}>
          <SelectTrigger className="w-[72px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOURS.map(hr => (
              <SelectItem key={hr} value={hr}>{hr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground font-medium">:</span>
        <Select value={snappedMin} onValueChange={v => onChange(`${h}:${v}`)}>
          <SelectTrigger className="w-[68px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MINUTES.map(min => (
              <SelectItem key={min} value={min}>{min}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

interface DayResultJson {
  lineItems?: { description: string; total: number }[];
  penalties?: { description: string; total: number }[];
  subtotal?: number;
  travelPay?: number;
  mileage?: number;
  mileageMiles?: number;
}

interface ProjectDaySummary {
  id: string;
  work_date: string;
  role_name: string;
  grand_total: number;
  day_number: number;
  result_json?: DayResultJson;
  wrap_time?: string;
  call_time?: string;
}

interface FullProjectDay {
  id: string;
  project_id: string;
  day_number: number;
  work_date: string;
  role_name: string;
  department: string;
  agreed_rate: number;
  day_type: string;
  day_of_week: string;
  call_time: string;
  wrap_time: string;
  result_json: Record<string, unknown>;
  grand_total: number;
  first_break_given: boolean;
  first_break_time: string;
  first_break_duration: number;
  second_break_given: boolean;
  second_break_time: string;
  second_break_duration: number;
  continuous_first_break_given: boolean;
  continuous_additional_break_given: boolean;
  travel_hours: number;
  mileage: number;
  previous_wrap: string | null;
  is_bank_holiday: boolean;
}

function ProjectCalendar({
  projectDays,
  selectedDate,
  calendarMonth,
  onMonthChange,
  onSelectDay,
  onAddDate,
}: {
  projectDays: ProjectDaySummary[];
  selectedDate: string;
  calendarMonth: Date;
  onMonthChange: (d: Date) => void;
  onSelectDay?: (dayId: string) => void;
  onAddDate: (date: string) => void;
}) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // Mon = 0, offset for Mon-start grid
  const rawStart = getDay(monthStart);
  const startPadding = rawStart === 0 ? 6 : rawStart - 1;

  const bookedDates = new Set(projectDays.map(d => d.work_date));
  const dayByDate = Object.fromEntries(projectDays.map(d => [d.work_date, d]));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <button
          onClick={() => onMonthChange(subMonths(calendarMonth, 1))}
          className="p-1 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-semibold">{format(calendarMonth, 'MMMM yyyy')}</span>
        <button
          onClick={() => onMonthChange(addMonths(calendarMonth, 1))}
          className="p-1 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] text-muted-foreground py-0.5">{d}</div>
        ))}
        {Array.from({ length: startPadding }, (_, i) => <div key={`pad-${i}`} />)}
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isBooked = bookedDates.has(dateStr);
          const isSelected = dateStr === selectedDate;
          const isHovered = hoveredDate === dateStr;

          return (
            <div
              key={dateStr}
              className="relative aspect-square flex items-center justify-center"
              onMouseEnter={() => setHoveredDate(dateStr)}
              onMouseLeave={() => setHoveredDate(null)}
            >
              <button
                onClick={() => {
                  if (isBooked) {
                    onSelectDay?.(dayByDate[dateStr].id);
                  } else {
                    onAddDate(dateStr);
                  }
                }}
                title={isBooked ? `${dayByDate[dateStr].role_name} — £${(dayByDate[dateStr].grand_total || 0).toFixed(0)}` : 'Add day'}
                className={cn(
                  'w-full h-full flex items-center justify-center rounded-full text-[11px] transition-all',
                  isBooked && isSelected
                    ? 'bg-[#1F1F21] text-white ring-2 ring-[#FFD528] ring-offset-1 font-bold'
                    : isBooked
                    ? 'bg-[#1F1F21] text-white font-semibold'
                    : isSelected
                    ? 'bg-muted font-semibold'
                    : isHovered
                    ? 'bg-muted/70'
                    : '',
                )}
              >
                {isBooked && isHovered ? (
                  <Pencil className="h-2.5 w-2.5" />
                ) : !isBooked && isHovered ? (
                  <Plus className="h-3 w-3 text-[#1F1F21]" />
                ) : (
                  format(day, 'd')
                )}
              </button>
            </div>
          );
        })}
      </div>

      {projectDays.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground flex justify-between">
          <span>{projectDays.length} day{projectDays.length !== 1 ? 's' : ''} booked</span>
          <span className="font-mono font-medium text-foreground">
            £{projectDays.reduce((s, d) => s + (d.grand_total || 0), 0).toFixed(0)}
          </span>
        </div>
      )}
    </div>
  );
}

const SESSION_KEY = 'crewrate-calc-state';

interface SessionState {
  projectId: string | null;
  projectName: string;
  selectedRoleName: string | null;
  agreedRate: string;
  dayType: string;
  workDate: string;
  isBankHoliday: boolean;
  callTime: string;
  wrapTime: string;
  firstBreakGiven: boolean;
  firstBreakTime: string;
  firstBreakDuration: string;
  secondBreakGiven: boolean;
  secondBreakTime: string;
  secondBreakDuration: string;
  continuousFirstBreakGiven: boolean;
  continuousAdditionalBreakGiven: boolean;
  travelHours: string;
  mileage: string;
  previousWrap: string;
  currentDayId: string | null;
  isDirty: boolean;
}

function loadSession(): SessionState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSession(s: SessionState) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
}

interface UserProject {
  id: string;
  name: string;
  client_name: string | null;
}

export function CalculatorPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const projectNameFromUrl = searchParams.get('name');
  const navigate = useNavigate();

  // Try to restore from session on first mount (only when no URL params override)
  const sessionRef = useRef(loadSession());
  const hasUrlProject = !!searchParams.get('project');
  const ss = (!hasUrlProject && sessionRef.current) ? sessionRef.current : null;
  const restoredFromSession = useRef(!!ss);

  const [selectedRole, setSelectedRole] = useState<CrewRole | null>(() => {
    const name = ss?.selectedRoleName;
    return name ? APA_CREW_ROLES.find(r => r.role === name) ?? null : null;
  });
  const [agreedRate, setAgreedRate] = useState<string>(ss?.agreedRate ?? '');
  const [dayType, setDayType] = useState<DayType>((ss?.dayType as DayType) ?? 'basic_working');
  const [workDate, setWorkDate] = useState(ss?.workDate ?? format(new Date(), 'yyyy-MM-dd'));
  const [isBankHoliday, setIsBankHoliday] = useState(ss?.isBankHoliday ?? false);
  const [callTime, setCallTime] = useState(ss?.callTime ?? '08:00');
  const [wrapTime, setWrapTime] = useState(ss?.wrapTime ?? '19:00');
  const [firstBreakGiven, setFirstBreakGiven] = useState(ss?.firstBreakGiven ?? true);
  const [firstBreakTime, setFirstBreakTime] = useState(ss?.firstBreakTime ?? '13:00');
  const [firstBreakDuration, setFirstBreakDuration] = useState(ss?.firstBreakDuration ?? '60');
  const [secondBreakGiven, setSecondBreakGiven] = useState(ss?.secondBreakGiven ?? true);
  const [secondBreakTime, setSecondBreakTime] = useState(ss?.secondBreakTime ?? '18:30');
  const [secondBreakDuration, setSecondBreakDuration] = useState(ss?.secondBreakDuration ?? '30');
  const [continuousFirstBreakGiven, setContinuousFirstBreakGiven] = useState(ss?.continuousFirstBreakGiven ?? true);
  const [continuousAdditionalBreakGiven, setContinuousAdditionalBreakGiven] = useState(ss?.continuousAdditionalBreakGiven ?? true);
  const [travelHours, setTravelHours] = useState(ss?.travelHours ?? '0');
  const [mileage, setMileage] = useState(ss?.mileage ?? '0');
  const [previousWrap, setPreviousWrap] = useState(ss?.previousWrap ?? '');
  const [projectName, setProjectName] = useState(ss?.projectName ?? '');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [favouriteRoles, setFavouriteRoles] = useState<string[]>([]);
  const [customRoles, setCustomRoles] = useState<CrewRole[]>([]);

  // Track which saved day we're currently editing (null = new day)
  const [currentDayId, setCurrentDayId] = useState<string | null>(ss?.currentDayId ?? null);
  const [projectDays, setProjectDays] = useState<ProjectDaySummary[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set(['__current__']));
  const formTopRef = useRef<HTMLDivElement>(null);
  const suppressDirtyRef = useRef(!!ss); // Suppress initial dirty flag when restoring from session

  // Unsaved changes tracking
  const [isDirty, setIsDirty] = useState(ss?.isDirty ?? false);
  // Pending within-page navigation when user has unsaved changes
  const [pendingDayId, setPendingDayId] = useState<string | null>(null);

  // Change Project picker
  const [allProjects, setAllProjects] = useState<UserProject[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const projectPickerRef = useRef<HTMLDivElement>(null);

  // If restored from session with a projectId, update URL to match
  useEffect(() => {
    if (!hasUrlProject && ss?.projectId) {
      setSearchParams({ project: ss.projectId }, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist form state to sessionStorage whenever it changes
  useEffect(() => {
    saveSession({
      projectId,
      projectName,
      selectedRoleName: selectedRole?.role ?? null,
      agreedRate,
      dayType,
      workDate,
      isBankHoliday,
      callTime,
      wrapTime,
      firstBreakGiven,
      firstBreakTime,
      firstBreakDuration,
      secondBreakGiven,
      secondBreakTime,
      secondBreakDuration,
      continuousFirstBreakGiven,
      continuousAdditionalBreakGiven,
      travelHours,
      mileage,
      previousWrap,
      currentDayId,
      isDirty,
    });
  }, [projectId, projectName, selectedRole, agreedRate, dayType, workDate, isBankHoliday, callTime, wrapTime, firstBreakGiven, firstBreakTime, firstBreakDuration, secondBreakGiven, secondBreakTime, secondBreakDuration, continuousFirstBreakGiven, continuousAdditionalBreakGiven, travelHours, mileage, previousWrap, currentDayId, isDirty]);

  // Load projects list for the picker
  useEffect(() => {
    if (user) {
      supabase.from('projects').select('id, name, client_name')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .then(({ data }) => { if (data) setAllProjects(data); });
    }
  }, [user]);

  // Close project picker on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (projectPickerRef.current && !projectPickerRef.current.contains(e.target as Node)) {
        setShowProjectPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitchProject = (proj: UserProject) => {
    setShowProjectPicker(false);
    setProjectName(proj.name);
    // Navigate to this project — the useEffect on projectId will load its days
    setSearchParams({ project: proj.id, name: proj.name }, { replace: true });
    // Reset form for the new project (days will auto-load)
    suppressDirtyRef.current = true;
    setIsDirty(false);
    setCurrentDayId(null);
    setSaveSuccess(false);
  };

  const toggleDayExpanded = (id: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Warn on browser refresh/close when dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Load favourites and custom roles
  useEffect(() => {
    if (!user) return;
    supabase.from('favourite_roles').select('role_name').eq('user_id', user.id)
      .then(({ data }) => { if (data) setFavouriteRoles(data.map(f => f.role_name)); });
    supabase.from('custom_roles').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          const mapped: CrewRole[] = data.map(r => ({
            role: r.role_name,
            department: 'Custom',
            minRate: r.daily_rate,
            maxRate: r.daily_rate,
            otGrade: 'N/A' as const,
            otCoefficient: r.ot_coefficient,
            customBhr: r.custom_bhr ?? undefined,
            isCustom: true,
            customId: r.id,
          }));
          setCustomRoles(mapped);
          // If session had a custom role selected that wasn't found at mount time, restore it now
          const sessionRoleName = sessionRef.current?.selectedRoleName;
          if (sessionRoleName && !selectedRole) {
            const found = mapped.find(r => r.role === sessionRoleName);
            if (found) {
              suppressDirtyRef.current = true;
              setSelectedRole(found);
            }
          }
        }
      });
  }, [user]);

  // Load project days & auto-load last day when entering a project
  useEffect(() => {
    if (projectId) {
      supabase.from('project_days')
        .select('id, work_date, role_name, grand_total, day_number, result_json, wrap_time, call_time')
        .eq('project_id', projectId)
        .order('work_date', { ascending: true })
        .then(({ data }) => {
          if (data) {
            setProjectDays(data as ProjectDaySummary[]);
            // Skip auto-load if we restored form state from session (user was mid-edit)
            if (restoredFromSession.current) {
              restoredFromSession.current = false;
              return;
            }
            // If there are saved days, auto-load the most recent one
            if (data.length > 0) {
              const lastDay = data[data.length - 1];
              loadDayById(lastDay.id);
            }
          }
        });
    }
  }, [projectId]);

  // Load project name (skip if already set from session restore)
  useEffect(() => {
    if (projectName) return; // Already set (e.g. from session)
    if (projectNameFromUrl) {
      setProjectName(decodeURIComponent(projectNameFromUrl));
    } else if (projectId) {
      supabase.from('projects').select('name').eq('id', projectId).single().then(({ data }) => {
        if (data) setProjectName(data.name);
      });
    }
  }, [projectId, projectNameFromUrl]);

  const dayOfWeek: DayOfWeek = useMemo(() => {
    if (isBankHoliday) return 'bank_holiday';
    return dateToDayOfWeek(workDate);
  }, [workDate, isBankHoliday]);

  // Auto-detect previous day's wrap for TOC — only within the same project,
  // only when work dates are consecutive (≤1 calendar day apart).
  // TOC does NOT apply across different jobs (APA S.5).
  const autoPreviousWrap = useMemo((): string => {
    if (!projectDays.length || !workDate) return '';
    // Exclude the day currently being edited so we don't compare a day to itself
    const others = projectDays
      .filter(d => d.id !== currentDayId)
      .sort((a, b) => a.work_date.localeCompare(b.work_date));
    const prevDays = others.filter(d => d.work_date < workDate);
    if (prevDays.length === 0) return '';
    const prevDay = prevDays[prevDays.length - 1];
    if (!prevDay.wrap_time) return '';
    // Only within consecutive calendar days (max 1 day gap)
    const prevDate = new Date(prevDay.work_date + 'T12:00:00');
    const currDate = new Date(workDate + 'T12:00:00');
    const daysDiff = Math.round((currDate.getTime() - prevDate.getTime()) / 86_400_000);
    if (daysDiff > 1) return '';
    return prevDay.wrap_time;
  }, [projectDays, workDate, currentDayId]);

  const result: CalculationResult | null = useMemo(() => {
    if (!selectedRole || !agreedRate) return null;
    const rate = parseInt(agreedRate);
    if (isNaN(rate) || rate <= 0) return null;

    return calculateCrewCost({
      role: selectedRole,
      agreedDailyRate: rate,
      dayType,
      dayOfWeek,
      callTime,
      wrapTime,
      firstBreakGiven,
      firstBreakTime: firstBreakGiven ? firstBreakTime : undefined,
      firstBreakDurationMins: parseInt(firstBreakDuration) || 60,
      secondBreakGiven,
      secondBreakTime: secondBreakGiven ? secondBreakTime : undefined,
      secondBreakDurationMins: parseInt(secondBreakDuration) || 30,
      continuousFirstBreakGiven,
      continuousAdditionalBreakGiven,
      travelHours: parseFloat(travelHours) || 0,
      mileageOutsideM25: parseFloat(mileage) || 0,
      previousWrapTime: autoPreviousWrap || undefined,
    });
  }, [selectedRole, agreedRate, dayType, dayOfWeek, callTime, wrapTime, firstBreakGiven, firstBreakTime, firstBreakDuration, secondBreakGiven, secondBreakTime, secondBreakDuration, continuousFirstBreakGiven, continuousAdditionalBreakGiven, travelHours, mileage, autoPreviousWrap, workDate, isBankHoliday]);

  // Mark dirty whenever the calculated result changes (but not during load/reset)
  useEffect(() => {
    if (suppressDirtyRef.current) {
      suppressDirtyRef.current = false;
      return;
    }
    if (result !== null) setIsDirty(true);
  }, [result]);

  const handleRoleChange = (roleName: string) => {
    // Search custom roles first, then APA roles
    const custom = customRoles.find(r => r.role === roleName);
    if (custom) {
      setSelectedRole(custom);
      if (custom.maxRate) setAgreedRate(custom.maxRate.toString());
      return;
    }
    const role = APA_CREW_ROLES.find(r => r.role === roleName);
    setSelectedRole(role || null);
    if (role?.maxRate) {
      setAgreedRate(role.maxRate.toString());
    }
  };

  const handleDayTypeChange = (newType: DayType) => {
    setDayType(newType);
    // Auto-set wrap time to the standard duration for the selected day type
    const defaultHours = DEFAULT_WRAP_HOURS[newType];
    if (defaultHours !== undefined) {
      setWrapTime(addHoursToTime(callTime, defaultHours));
    }
  };

  const loadDayIntoForm = (day: FullProjectDay) => {
    suppressDirtyRef.current = true;
    setIsDirty(false);
    setPendingDayId(null);
    setCurrentDayId(day.id);
    setWorkDate(day.work_date);
    setIsBankHoliday(day.is_bank_holiday ?? false);
    setDayType(day.day_type as DayType);
    setCallTime(day.call_time);
    setWrapTime(day.wrap_time);
    setFirstBreakGiven(day.first_break_given ?? true);
    setFirstBreakTime(day.first_break_time || '13:00');
    setFirstBreakDuration(String(day.first_break_duration ?? 60));
    setSecondBreakGiven(day.second_break_given ?? true);
    setSecondBreakTime(day.second_break_time || '18:30');
    setSecondBreakDuration(String(day.second_break_duration ?? 30));
    setContinuousFirstBreakGiven(day.continuous_first_break_given ?? true);
    setContinuousAdditionalBreakGiven(day.continuous_additional_break_given ?? true);
    setTravelHours(String(day.travel_hours ?? 0));
    setMileage(String(day.mileage ?? 0));
    setPreviousWrap(day.previous_wrap ?? '');
    const role = customRoles.find(r => r.role === day.role_name) ?? APA_CREW_ROLES.find(r => r.role === day.role_name);
    if (role) {
      setSelectedRole(role);
      setAgreedRate(String(day.agreed_rate));
    }
    setSaveSuccess(false);
  };

  const loadDayById = async (dayId: string) => {
    if (isDirty) {
      setPendingDayId(dayId);
      return;
    }
    const { data } = await supabase.from('project_days').select('*').eq('id', dayId).single();
    if (data) loadDayIntoForm(data as FullProjectDay);
  };

  const confirmSwitchDay = async () => {
    if (!pendingDayId) return;
    const id = pendingDayId;
    setPendingDayId(null);
    setIsDirty(false);
    const { data } = await supabase.from('project_days').select('*').eq('id', id).single();
    if (data) loadDayIntoForm(data as FullProjectDay);
  };

  const refreshProjectDays = async (projId: string) => {
    const { data } = await supabase.from('project_days')
      .select('id, work_date, role_name, grand_total, day_number, result_json, wrap_time, call_time')
      .eq('project_id', projId)
      .order('work_date', { ascending: true });
    if (data) setProjectDays(data as ProjectDaySummary[]);
  };

  const handleReset = () => {
    suppressDirtyRef.current = true;
    setIsDirty(false);
    setCurrentDayId(null);
    setSelectedRole(null);
    setAgreedRate('');
    setDayType('basic_working');
    setWorkDate(format(new Date(), 'yyyy-MM-dd'));
    setIsBankHoliday(false);
    setCallTime('08:00');
    setWrapTime('19:00');
    setFirstBreakGiven(true);
    setFirstBreakTime('13:00');
    setFirstBreakDuration('60');
    setSecondBreakGiven(true);
    setSecondBreakTime('18:30');
    setSecondBreakDuration('30');
    setContinuousFirstBreakGiven(true);
    setContinuousAdditionalBreakGiven(true);
    setTravelHours('0');
    setMileage('0');
    setPreviousWrap('');
  };

  // Start a fresh day for a given date, carrying role/rate/project across
  const handleAddNewDay = (date: string) => {
    suppressDirtyRef.current = true;
    setIsDirty(false);
    setPendingDayId(null);
    setCurrentDayId(null);
    setWorkDate(date);
    setIsBankHoliday(false);
    setDayType('basic_working');
    setCallTime('08:00');
    setWrapTime('19:00');
    setFirstBreakGiven(true);
    setFirstBreakTime('13:00');
    setFirstBreakDuration('60');
    setSecondBreakGiven(true);
    setSecondBreakTime('18:30');
    setSecondBreakDuration('30');
    setContinuousFirstBreakGiven(true);
    setContinuousAdditionalBreakGiven(true);
    setTravelHours('0');
    setMileage('0');
    setPreviousWrap('');
    setSaveSuccess(false);
    // Scroll form back to top
    setTimeout(() => formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleSave = async (): Promise<string | null> => {
    if (!result || !user || !selectedRole) return null;
    setSaving(true);
    setSaveSuccess(false);

    // Resolve or create a project
    let resolvedProjectId = projectId;
    if (!resolvedProjectId) {
      const { data: proj, error: projError } = await supabase.from('projects').insert({
        user_id: user.id,
        name: projectName || 'Untitled',
        client_name: null,
      }).select().single();
      if (projError || !proj) { setSaving(false); return null; }
      resolvedProjectId = proj.id;
    }

    const payload = {
      project_id: resolvedProjectId,
      work_date: workDate,
      role_name: selectedRole.role,
      department: selectedRole.department,
      agreed_rate: parseInt(agreedRate),
      day_type: dayType,
      day_of_week: dayOfWeek,
      call_time: callTime,
      wrap_time: wrapTime,
      result_json: result,
      grand_total: result.grandTotal,
      first_break_given: firstBreakGiven,
      first_break_time: firstBreakTime,
      first_break_duration: parseInt(firstBreakDuration),
      second_break_given: secondBreakGiven,
      second_break_time: secondBreakTime,
      second_break_duration: parseInt(secondBreakDuration),
      continuous_first_break_given: continuousFirstBreakGiven,
      continuous_additional_break_given: continuousAdditionalBreakGiven,
      travel_hours: parseFloat(travelHours),
      mileage: parseFloat(mileage),
      previous_wrap: autoPreviousWrap || null,
      is_bank_holiday: isBankHoliday,
    };

    // Update project name if it has changed
    if (resolvedProjectId && projectName) {
      await supabase.from('projects')
        .update({ name: projectName, updated_at: new Date().toISOString() })
        .eq('id', resolvedProjectId);
    }

    let savedId: string | null = null;

    if (currentDayId) {
      // UPDATE existing day
      const { error } = await supabase.from('project_days').update(payload).eq('id', currentDayId);
      if (!error) savedId = currentDayId;
    } else {
      // INSERT new day
      const { count } = await supabase.from('project_days')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', resolvedProjectId);
      const { data, error } = await supabase.from('project_days').insert({
        ...payload,
        day_number: (count ?? 0) + 1,
      }).select('id').single();
      if (!error && data) {
        savedId = data.id;
        setCurrentDayId(data.id);
      }
    }

    setSaving(false);
    if (savedId && resolvedProjectId) {
      setSaveSuccess(true);
      setIsDirty(false);
      await refreshProjectDays(resolvedProjectId);
    }
    return savedId;
  };

  const handleAddDay = async () => {
    if (!result || !user || !selectedRole) return;
    await handleSave();
    // Fresh form for next date, carrying role/rate/project
    handleAddNewDay(format(addDays(parseISO(workDate), 1), 'yyyy-MM-dd'));
  };

  return (
    <>
    {/* Within-page unsaved warning (switching days in calendar) */}
    {pendingDayId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl border border-border p-6 max-w-sm w-full mx-4 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Unsaved changes</h2>
            <p className="text-sm text-muted-foreground">
              You have unsaved changes on this day. If you switch now, your changes will be lost.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setPendingDayId(null)}>Stay</Button>
            <Button variant="destructive" onClick={confirmSwitchDay}>Discard & switch</Button>
          </div>
        </div>
      </div>
    )}


<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Input Form */}
      <div className="lg:col-span-2 space-y-6" ref={formTopRef}>
        {isDirty && (
          <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
            <span>⚠ Unsaved changes</span>
            <Button size="sm" onClick={handleSave} disabled={saving || !result} className="h-7 text-xs">
              {saving ? 'Saving…' : 'Save now'}
            </Button>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PoundSterling className="h-5 w-5" />
              Crew Rate Calculator
              {currentDayId && (
                <Badge variant="outline" className="ml-2 text-xs font-normal">Editing saved day</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Project Name */}
            <div className="space-y-2">
              <Label htmlFor="project">Project Name</Label>
              <div className="flex gap-2">
                <Input id="project" placeholder="e.g. Nike Summer Campaign" value={projectName} onChange={e => setProjectName(e.target.value)} className="flex-1" />
                <div className="relative" ref={projectPickerRef}>
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    title="Change project"
                    onClick={() => setShowProjectPicker(!showProjectPicker)}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                  {showProjectPicker && (
                    <div className="absolute right-0 top-11 w-72 rounded-2xl border border-border bg-white shadow-xl z-50 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-border/40">
                        <p className="text-xs font-semibold text-muted-foreground">Switch to project</p>
                      </div>
                      {allProjects.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground text-center">No projects yet</div>
                      ) : (
                        <div className="max-h-60 overflow-y-auto py-1">
                          {allProjects.map(proj => (
                            <button
                              key={proj.id}
                              onClick={() => handleSwitchProject(proj)}
                              className={cn(
                                'w-full text-left px-4 py-2.5 text-sm hover:bg-primary/5 transition-colors flex items-center justify-between gap-2',
                                proj.id === projectId && 'bg-primary/10 font-medium',
                              )}
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium">{proj.name}</p>
                                {proj.client_name && (
                                  <p className="text-xs text-muted-foreground truncate">{proj.client_name}</p>
                                )}
                              </div>
                              {proj.id === projectId && (
                                <Badge variant="outline" className="text-[10px] shrink-0">Current</Badge>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Role Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Crew Role</Label>
                <Select onValueChange={handleRoleChange} value={selectedRole?.role}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customRoles.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-[#FFD528] text-[#FFD528]" /> Custom Rates
                        </SelectLabel>
                        {customRoles.map(role => (
                          <SelectItem key={`custom-${role.customId}`} value={role.role}>
                            {role.role}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {favouriteRoles.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Favourites
                        </SelectLabel>
                        {favouriteRoles.map(roleName => {
                          const role = APA_CREW_ROLES.find(r => r.role === roleName);
                          return role ? (
                            <SelectItem key={`fav-${role.role}`} value={role.role}>
                              {role.role}
                            </SelectItem>
                          ) : null;
                        })}
                      </SelectGroup>
                    )}
                    {DEPARTMENTS.map(dept => {
                      const deptRoles = getRolesByDepartment(dept).filter(r => !favouriteRoles.includes(r.role));
                      if (deptRoles.length === 0) return null;
                      return (
                        <SelectGroup key={dept}>
                          <SelectLabel>{dept}</SelectLabel>
                          {deptRoles.map(role => (
                            <SelectItem key={role.role} value={role.role}>
                              {role.role}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rate">Agreed Daily Rate</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
                  <Input id="rate" type="number" className="pl-7" value={agreedRate} onChange={e => setAgreedRate(e.target.value)} placeholder={selectedRole ? `${selectedRole.minRate || '—'} - ${selectedRole.maxRate || '—'}` : 'Select role first'} />
                </div>
                {selectedRole && (
                  <p className="text-xs text-muted-foreground">
                    {selectedRole.isCustom ? (
                      <>
                        Custom grade · OT x{selectedRole.otCoefficient}
                        {agreedRate && ` | BHR £${selectedRole.customBhr ?? Math.round(parseInt(agreedRate) / 10)}/hr`}
                        {agreedRate && selectedRole.otCoefficient > 0 && ` | OT £${Math.round((selectedRole.customBhr ?? Math.round(parseInt(agreedRate) / 10)) * selectedRole.otCoefficient)}/hr`}
                      </>
                    ) : (
                      <>
                        APA range: £{selectedRole.minRate || 'N/A'} – £{selectedRole.maxRate || 'N/A'}
                        {selectedRole.otGrade !== 'N/A' && ` | OT Grade ${selectedRole.otGrade} (x${selectedRole.otCoefficient})`}
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Day Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Day Type</Label>
                <Select value={dayType} onValueChange={v => handleDayTypeChange(v as DayType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_TYPES.map(dt => (
                      <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workDate">Date Worked</Label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="workDate" type="date" className="pl-10" value={workDate} onChange={e => setWorkDate(e.target.value)} />
                </div>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{isBankHoliday ? 'Bank Holiday' : DAY_LABELS[dateToDayOfWeek(workDate)]}</Badge>
                  <div className="flex items-center gap-2">
                    <Checkbox id="bankHol" checked={isBankHoliday} onCheckedChange={v => setIsBankHoliday(!!v)} />
                    <Label htmlFor="bankHol" className="text-xs">Bank Holiday</Label>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
              <TimePicker
                label={dayType === 'travel' ? 'Departure Time' : 'Call Time'}
                value={callTime}
                onChange={setCallTime}
              />
              <div className="hidden md:flex items-center pb-2 text-muted-foreground text-sm">→</div>
              <TimePicker
                label={dayType === 'travel' ? 'Arrival Time' : 'Wrap Time'}
                value={wrapTime}
                onChange={setWrapTime}
              />
            </div>
            {dayType === 'travel' && (
              <div className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
                <span>Minimum 5 hours · Paid at BHR (single time, any day) · Not applicable to PM/PA/Runners</span>
              </div>
            )}
            {callTime && wrapTime && (() => {
              let callMins = parseInt(callTime.split(':')[0]) * 60 + parseInt(callTime.split(':')[1]);
              let wrapMins = parseInt(wrapTime.split(':')[0]) * 60 + parseInt(wrapTime.split(':')[1]);
              if (wrapMins <= callMins) wrapMins += 24 * 60;
              const totalHrs = (wrapMins - callMins) / 60;
              const effectiveHrs = dayType === 'travel' ? Math.max(totalHrs, 5) : totalHrs;
              const hrs = Math.floor(totalHrs);
              const mins = Math.round((totalHrs - hrs) * 60);
              const isUnderMin = dayType === 'travel' && totalHrs < 5;
              return (
                <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isUnderMin ? 'bg-amber-50 border border-amber-200' : 'bg-muted/50'}`}>
                  <span className="text-muted-foreground">{dayType === 'travel' ? 'Travel duration:' : 'Day length:'}</span>
                  <span className="font-medium">{hrs}h {mins > 0 ? `${mins}m` : ''}</span>
                  {isUnderMin && (
                    <span className="text-amber-700">— charged at minimum 5h ({effectiveHrs}h billed)</span>
                  )}
                  {!isUnderMin && dayType !== 'travel' && (
                    <span className="text-muted-foreground">({totalHrs} hours)</span>
                  )}
                </div>
              );
            })()}

            <Separator />

            {/* Breaks */}
            {(dayType === 'basic_working' || dayType === 'continuous_working') && (
              <>
                <div className="space-y-4">
                  <h3 className="font-medium">Breaks & Penalties</h3>

                  {dayType === 'basic_working' && (
                    <>
                      <div className="space-y-3 rounded-md border p-4">
                        <div className="flex items-center gap-3">
                          <Checkbox id="break1" checked={firstBreakGiven} onCheckedChange={v => setFirstBreakGiven(!!v)} />
                          <Label htmlFor="break1" className="font-medium">First break given (1 hour)</Label>
                        </div>
                        {firstBreakGiven && (
                          <div className="ml-7 grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <TimePicker label="Break started at" value={firstBreakTime} onChange={setFirstBreakTime} />
                              <p className="text-xs text-muted-foreground">Must start within 5½ hrs of call</p>
                            </div>
                            <div className="space-y-2">
                              <Label>Duration given</Label>
                              <Select value={firstBreakDuration} onValueChange={setFirstBreakDuration}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="60">60 mins (full)</SelectItem>
                                  <SelectItem value="45">45 mins (curtailed)</SelectItem>
                                  <SelectItem value="30">30 mins (curtailed)</SelectItem>
                                  <SelectItem value="15">15 mins (curtailed)</SelectItem>
                                </SelectContent>
                              </Select>
                              {parseInt(firstBreakDuration) < 60 && (
                                <p className="text-xs text-orange-600">Curtailed by {60 - parseInt(firstBreakDuration)} mins — penalty applies</p>
                              )}
                            </div>
                          </div>
                        )}
                        {!firstBreakGiven && (
                          <p className="ml-7 text-xs text-orange-600">Day treated as Continuous Working Day</p>
                        )}
                      </div>

                      <div className="space-y-3 rounded-md border p-4">
                        <div className="flex items-center gap-3">
                          <Checkbox id="break2" checked={secondBreakGiven} onCheckedChange={v => setSecondBreakGiven(!!v)} />
                          <Label htmlFor="break2" className="font-medium">Second break given (30 mins)</Label>
                        </div>
                        {secondBreakGiven && (
                          <div className="ml-7 grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <TimePicker label="Break started at" value={secondBreakTime} onChange={setSecondBreakTime} />
                              <p className="text-xs text-muted-foreground">Within 5½ hrs after first break ended</p>
                            </div>
                            <div className="space-y-2">
                              <Label>Duration given</Label>
                              <Select value={secondBreakDuration} onValueChange={setSecondBreakDuration}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="30">30 mins (full)</SelectItem>
                                  <SelectItem value="20">20 mins (curtailed)</SelectItem>
                                  <SelectItem value="15">15 mins (curtailed)</SelectItem>
                                </SelectContent>
                              </Select>
                              {parseInt(secondBreakDuration) < 30 && (
                                <p className="text-xs text-orange-600">Curtailed by {30 - parseInt(secondBreakDuration)} mins — penalty applies</p>
                              )}
                            </div>
                          </div>
                        )}
                        {!secondBreakGiven && (
                          <p className="ml-7 text-xs text-orange-600">30 mins at BHR penalty applies</p>
                        )}
                      </div>
                    </>
                  )}

                  {dayType === 'continuous_working' && (
                    <div className="space-y-3 rounded-md border p-4">
                      <div className="flex items-center gap-3">
                        <Checkbox id="contBreak" checked={continuousFirstBreakGiven} onCheckedChange={v => setContinuousFirstBreakGiven(!!v)} />
                        <Label htmlFor="contBreak">30-min break given after 9 hours</Label>
                      </div>
                      {!continuousFirstBreakGiven && (
                        <p className="ml-7 text-xs text-orange-600">30 mins at BHR penalty applies</p>
                      )}
                      <div className="flex items-center gap-3">
                        <Checkbox id="contBreak2" checked={continuousAdditionalBreakGiven} onCheckedChange={v => setContinuousAdditionalBreakGiven(!!v)} />
                        <Label htmlFor="contBreak2">Additional 30-min break given after 12½ hours</Label>
                      </div>
                      {!continuousAdditionalBreakGiven && (
                        <p className="ml-7 text-xs text-orange-600">30 mins at BHR penalty applies (if day exceeds 12½ hrs)</p>
                      )}
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Travel & Mileage */}
            <div className="space-y-4">
              <h3 className="font-medium">Travel & Mileage</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Travel time on working days only — hidden on Travel Day (times already capture it) */}
                {dayType !== 'travel' && (
                  <div className="space-y-2">
                    <Label>Additional Travel Time</Label>
                    <div className="flex items-center gap-2">
                      <Select value={String(Math.floor(parseFloat(travelHours) || 0))} onValueChange={v => {
                        const mins = (parseFloat(travelHours) || 0) % 1;
                        setTravelHours(String(parseInt(v) + mins));
                      }}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 13 }, (_, i) => (
                            <SelectItem key={i} value={String(i)}>{i} hrs</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={String(Math.round(((parseFloat(travelHours) || 0) % 1) * 60))} onValueChange={v => {
                        const hrs = Math.floor(parseFloat(travelHours) || 0);
                        setTravelHours(String(hrs + parseInt(v) / 60));
                      }}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0 min</SelectItem>
                          <SelectItem value="30">30 min</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">Paid at BHR. Only payable if travel + work ≥ 11hrs</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="mileage">Miles outside M25</Label>
                  <div className="relative">
                    <Input id="mileage" type="number" value={mileage} onChange={e => setMileage(e.target.value)} min="0" placeholder="0" />
                  </div>
                  <p className="text-xs text-muted-foreground">50p per mile — W1F 9SE to location and back</p>
                </div>
              </div>
            </div>

            {/* Time Off The Clock — auto-calculated from project days */}
            {autoPreviousWrap && callTime && (() => {
              let prevMins = parseInt(autoPreviousWrap.split(':')[0]) * 60 + parseInt(autoPreviousWrap.split(':')[1]);
              let callMins = parseInt(callTime.split(':')[0]) * 60 + parseInt(callTime.split(':')[1]);
              let gap = callMins - prevMins;
              if (gap < 0) gap += 24 * 60;
              const gapHrs = Math.floor(gap / 60);
              const gapMins = gap % 60;
              const isTOC = gap / 60 < 11;
              return (
                <div className={`rounded-xl border px-4 py-3 text-sm space-y-1 ${isTOC ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                  <div className="font-medium">{isTOC ? '⚠ Time Off The Clock penalty applies' : '✓ Rest gap OK'}</div>
                  <div className="text-xs opacity-80">
                    Previous wrap <strong>{autoPreviousWrap}</strong> → Today's call <strong>{callTime}</strong> = rest gap <strong>{gapHrs}h{gapMins > 0 ? ` ${gapMins}m` : ''}</strong>
                    {isTOC && ` (minimum 11h required — TOC: 1hr at OT rate added automatically)`}
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reset
              </Button>
              {result && (
                <>
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 mr-1" />
                    {saving ? 'Saving...' : saveSuccess ? 'Saved!' : currentDayId ? 'Update Day' : 'Save Day'}
                  </Button>
                  {projectId && (
                    <Button variant="secondary" onClick={handleAddDay} disabled={saving}>
                      <Plus className="h-4 w-4 mr-1" /> Add Next Day
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Panel */}
      <div className="space-y-4">
        {/* Project Calendar — always visible */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" /> Project Days
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ProjectCalendar
              projectDays={projectDays}
              selectedDate={workDate}
              calendarMonth={calendarMonth}
              onMonthChange={setCalendarMonth}
              onSelectDay={projectId ? loadDayById : undefined}
              onAddDate={handleAddNewDay}
            />
            {!projectId && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Save your first day to start tracking project days.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Cost Breakdown */}
        <Card className="sticky top-20">
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {!result ? (
              <p className="text-muted-foreground text-sm">Select a role and enter rate details to see the cost breakdown.</p>
            ) : (() => {
              // Build unified chronological list of all days
              const currentKey = currentDayId ?? '__new__';
              const savedOthers = projectDays.filter(d => d.id !== currentDayId);

              const allDays: Array<{
                key: string;
                work_date: string;
                role_name: string;
                grand_total: number;
                isCurrent: boolean;
                rj?: DayResultJson;
              }> = [
                ...savedOthers.map(d => ({
                  key: d.id,
                  work_date: d.work_date,
                  role_name: d.role_name,
                  grand_total: d.grand_total,
                  isCurrent: false,
                  rj: d.result_json,
                })),
                {
                  key: currentKey,
                  work_date: workDate,
                  role_name: selectedRole?.role ?? '—',
                  grand_total: result.grandTotal,
                  isCurrent: true,
                  rj: {
                    lineItems: result.lineItems,
                    penalties: result.penalties,
                    subtotal: result.subtotal,
                    travelPay: result.travelPay,
                    mileage: result.mileage,
                    mileageMiles: result.mileageMiles,
                  },
                },
              ].sort((a, b) => a.work_date.localeCompare(b.work_date));
              // Day number = chronological position (1-based)

              const projectTotal = allDays.reduce((s, d) => s + (d.grand_total || 0), 0);
              const isMultiDay = allDays.length > 1;

              return (
                <div className="space-y-3">
                  {allDays.map((day, idx) => {
                    const isExpanded = expandedDays.has(day.key);
                    const rj = day.rj;
                    const hasDetail = rj && (
                      (rj.lineItems?.length ?? 0) > 0 ||
                      (rj.penalties?.length ?? 0) > 0 ||
                      (rj.travelPay ?? 0) > 0 ||
                      (rj.mileage ?? 0) > 0
                    );

                    return (
                      <div key={day.key}>
                        {idx > 0 && <Separator className="mb-3" />}

                        {/* Day header row */}
                        <div
                          className={cn(
                            'flex items-center justify-between rounded-xl px-3 py-2 -mx-1 transition-colors',
                            day.isCurrent ? 'bg-primary/8 ring-1 ring-primary/20' : 'hover:bg-muted/40 cursor-pointer',
                          )}
                          onClick={() => { if (!day.isCurrent) loadDayById(day.key); }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {hasDetail && (
                              <button
                                onClick={e => { e.stopPropagation(); toggleDayExpanded(day.key); }}
                                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')} />
                              </button>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-tight">
                                Day {idx + 1}
                                {day.isCurrent && <span className="ml-1.5 text-xs text-[#FFD528] font-normal">(editing)</span>}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {day.work_date ? format(parseISO(day.work_date), 'EEE dd MMM') : '—'}
                                {day.role_name && ` · ${day.role_name}`}
                              </p>
                            </div>
                          </div>
                          <span className="font-mono text-sm font-semibold shrink-0 ml-2">
                            £{(day.grand_total || 0).toFixed(2)}
                          </span>
                        </div>

                        {/* Expandable detail */}
                        {isExpanded && hasDetail && rj && (
                          <div className="mt-2 ml-5 space-y-1.5 text-sm">
                            {/* Basic line items */}
                            {rj.lineItems?.map((item, i) => (
                              <div key={i} className="flex justify-between">
                                <span className="text-muted-foreground">{item.description}</span>
                                <span className="font-mono text-xs">£{item.total.toFixed(2)}</span>
                              </div>
                            ))}

                            {/* Penalties / OT */}
                            {(rj.penalties?.length ?? 0) > 0 && (
                              <>
                                <div className="pt-1 border-t border-border/60" />
                                <p className="text-xs font-medium text-orange-600">Penalties & OT</p>
                                {rj.penalties!.map((p, i) => (
                                  <div key={i} className="flex justify-between text-orange-700">
                                    <span>{p.description}</span>
                                    <span className="font-mono text-xs">£{p.total.toFixed(2)}</span>
                                  </div>
                                ))}
                              </>
                            )}

                            {/* Travel */}
                            {(rj.travelPay ?? 0) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Travel</span>
                                <span className="font-mono text-xs">£{(rj.travelPay ?? 0).toFixed(2)}</span>
                              </div>
                            )}

                            {/* Mileage */}
                            {(rj.mileage ?? 0) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Mileage ({rj.mileageMiles} mi @ 50p)</span>
                                <span className="font-mono text-xs">£{(rj.mileage ?? 0).toFixed(2)}</span>
                              </div>
                            )}

                            {/* Day total inside expanded */}
                            <div className="flex justify-between font-semibold pt-1 border-t border-border/60">
                              <span>Day Total</span>
                              <span className="font-mono text-xs text-primary">£{(day.grand_total || 0).toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Project total */}
                  {isMultiDay && (
                    <>
                      <Separator />
                      <div className="flex justify-between text-base font-bold px-1">
                        <span>Project Total</span>
                        <span className="font-mono text-foreground">£{projectTotal.toFixed(2)}</span>
                      </div>
                    </>
                  )}

                  {!isMultiDay && (
                    <>
                      <Separator />
                      <div className="flex justify-between text-base font-bold px-1">
                        <span>Total</span>
                        <span className="font-mono text-foreground">£{result.grandTotal.toFixed(2)}</span>
                      </div>
                    </>
                  )}

                  {saveSuccess && (
                    <Button
                      variant="outline"
                      className="w-full mt-1"
                      onClick={() => navigate('/invoices', { state: { dayId: currentDayId } })}
                    >
                      <InvoiceIcon className="h-4 w-4 mr-2" /> Convert to Invoice
                    </Button>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
}
