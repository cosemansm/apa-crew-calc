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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Save, RotateCcw, PoundSterling, CalendarDays, Star, Plus, FileText as InvoiceIcon, ChevronLeft, ChevronRight, Pencil, FolderOpen, Package, ChevronDown, Trash2, Receipt, Info, Check, Cloud, Car } from 'lucide-react';
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


function TimePicker({ value, onChange, label, labelAddon }: { value: string; onChange: (v: string) => void; label?: string; labelAddon?: React.ReactNode }) {
  const safe = /^\d{2}:\d{2}$/.test(value) ? value : '08:00';
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <Label className="text-sm">{label}</Label>
          {labelAddon}
        </div>
      )}
      <input
        type="time"
        value={safe}
        onChange={e => { if (e.target.value) onChange(e.target.value); }}
        className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
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
  equipmentValue?: number;
  equipmentDiscount?: number;
  equipmentTotal?: number;
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
  expenses_amount?: number;
  expenses_notes?: string;
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
  equipment_value: number;
  equipment_discount: number;
  expenses_amount: number;
  expenses_notes: string;
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

  const today = format(new Date(), 'yyyy-MM-dd');
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

      <div className="grid grid-cols-7">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] text-muted-foreground py-0.5">{d}</div>
        ))}
        {Array.from({ length: startPadding }, (_, i) => <div key={`pad-${i}`} className="h-8" />)}
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isBooked = bookedDates.has(dateStr);
          const isSelected = dateStr === selectedDate;
          const isHovered = hoveredDate === dateStr;
          const isToday = dateStr === today;

          // Connected bar logic — check if adjacent days are also booked
          const prevDate = format(addDays(day, -1), 'yyyy-MM-dd');
          const nextDate = format(addDays(day, 1), 'yyyy-MM-dd');
          const connPrev = isBooked && bookedDates.has(prevDate);
          const connNext = isBooked && bookedDates.has(nextDate);

          return (
            <div
              key={dateStr}
              className="relative h-8 flex items-center justify-center"
              onMouseEnter={() => setHoveredDate(dateStr)}
              onMouseLeave={() => setHoveredDate(null)}
            >
              {/* Connected bar track behind the dot */}
              {isBooked && (connPrev || connNext) && (
                <div className={cn(
                  'absolute top-1/2 -translate-y-1/2 h-[26px] bg-[#1F1F21]/15 pointer-events-none',
                  connPrev ? 'left-0' : 'left-1/2',
                  connNext ? 'right-0' : 'right-1/2',
                )} />
              )}
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
                  'relative z-10 w-[26px] h-[26px] flex items-center justify-center text-[11px] transition-all',
                  // Today gets a square-ish highlight
                  isToday && !isBooked ? 'rounded-md ring-2 ring-[#1F1F21]/30 font-bold' : 'rounded-full',
                  isBooked && isSelected
                    ? 'bg-[#1F1F21] text-white ring-2 ring-[#FFD528] ring-offset-1 font-bold rounded-full'
                    : isBooked
                    ? 'bg-[#1F1F21] text-white font-semibold rounded-full'
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
  equipmentValue: string;
  equipmentDiscount: string;
  expensesDayAmount: string;
  expensesDayNotes: string;
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
  // Track whether the user has manually set wrap time; if not, auto-follow call time
  const wrapManualRef = useRef(!!ss?.wrapTime); // treat restored session as manual
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
  const [equipmentValue, setEquipmentValue] = useState(ss?.equipmentValue ?? '0');
  const [equipmentDiscount, setEquipmentDiscount] = useState(ss?.equipmentDiscount ?? '0');
  const [expensesDayAmount, setExpensesDayAmount] = useState(ss?.expensesDayAmount ?? '');
  const [expensesDayNotes, setExpensesDayNotes] = useState(ss?.expensesDayNotes ?? '');
  const [previousWrap, setPreviousWrap] = useState(ss?.previousWrap ?? '');
  const [projectName, setProjectName] = useState(ss?.projectName ?? '');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [favouriteRoles, setFavouriteRoles] = useState<string[]>([]);
  const [customRoles, setCustomRoles] = useState<CrewRole[]>([]);

  // Equipment packages
  const [equipmentPackages, setEquipmentPackages] = useState<{ id: string; name: string; day_rate: number }[]>([]);
  const [showEquipmentPicker, setShowEquipmentPicker] = useState(false);
  const equipmentPickerRef = useRef<HTMLDivElement>(null);
  // Collapsible optional sections
  const [showTravel, setShowTravel] = useState(!!(ss?.travelHours && parseFloat(ss.travelHours) > 0) || !!(ss?.mileage && parseFloat(ss.mileage) > 0));
  const [showEquipmentSection, setShowEquipmentSection] = useState(!!(ss?.equipmentValue && parseFloat(ss.equipmentValue) > 0));
  const [showExpensesSection, setShowExpensesSection] = useState(!!ss?.expensesDayAmount);

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
      equipmentValue,
      equipmentDiscount,
      expensesDayAmount,
      expensesDayNotes,
      previousWrap,
      currentDayId,
      isDirty,
    });
  }, [projectId, projectName, selectedRole, agreedRate, dayType, workDate, isBankHoliday, callTime, wrapTime, firstBreakGiven, firstBreakTime, firstBreakDuration, secondBreakGiven, secondBreakTime, secondBreakDuration, continuousFirstBreakGiven, continuousAdditionalBreakGiven, travelHours, mileage, equipmentValue, equipmentDiscount, expensesDayAmount, expensesDayNotes, previousWrap, currentDayId, isDirty]);

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
    supabase.from('equipment_packages').select('id, name, day_rate').eq('user_id', user.id)
      .order('name', { ascending: true })
      .then(({ data }) => { if (data) setEquipmentPackages(data); });
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
            isBuyout: r.is_buyout ?? false,
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
        .select('id, work_date, role_name, grand_total, day_number, result_json, wrap_time, call_time, expenses_amount, expenses_notes')
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
      equipmentValue: parseFloat(equipmentValue) || 0,
      equipmentDiscount: parseFloat(equipmentDiscount) || 0,
    });
  }, [selectedRole, agreedRate, dayType, dayOfWeek, callTime, wrapTime, firstBreakGiven, firstBreakTime, firstBreakDuration, secondBreakGiven, secondBreakTime, secondBreakDuration, continuousFirstBreakGiven, continuousAdditionalBreakGiven, travelHours, mileage, autoPreviousWrap, workDate, isBankHoliday, equipmentValue, equipmentDiscount]);

  // Mark dirty whenever the calculated result changes (but not during load/reset)
  useEffect(() => {
    if (suppressDirtyRef.current) {
      suppressDirtyRef.current = false;
      return;
    }
    if (result !== null) setIsDirty(true);
  }, [result]);

  // ── Auto-save: fires 1.5s after result changes, when minimum fields are ready ──
  useEffect(() => {
    if (!result || !user || !selectedRole || !agreedRate) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const savedId = await handleSave();
      if (savedId) setLastSavedAt(new Date());
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

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
    wrapManualRef.current = true; // saved day has a real wrap time — don't auto-override
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
    setEquipmentValue(String(day.equipment_value ?? 0));
    setEquipmentDiscount(String(day.equipment_discount ?? 0));
    setExpensesDayAmount(day.expenses_amount ? String(day.expenses_amount) : '');
    setExpensesDayNotes(day.expenses_notes ?? '');
    // Auto-expand optional sections if they have saved values
    setShowTravel((day.travel_hours ?? 0) > 0 || (day.mileage ?? 0) > 0);
    setShowEquipmentSection((day.equipment_value ?? 0) > 0);
    setShowExpensesSection((day.expenses_amount ?? 0) > 0);
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
      .select('id, work_date, role_name, grand_total, day_number, result_json, wrap_time, call_time, expenses_amount, expenses_notes')
      .eq('project_id', projId)
      .order('work_date', { ascending: true });
    if (data) setProjectDays(data as ProjectDaySummary[]);
  };

  const removeDay = async (dayId: string) => {
    if (!confirm('Remove this day from the project?')) return;
    const { error } = await supabase.from('project_days').delete().eq('id', dayId);
    if (!error) {
      setProjectDays(prev => prev.filter(d => d.id !== dayId));
      // If we were editing this day, reset the form
      if (currentDayId === dayId) {
        setCurrentDayId(null);
        setIsDirty(false);
      }
    }
  };

  const handleReset = () => {
    suppressDirtyRef.current = true;
    setIsDirty(false);
    setCurrentDayId(null);
    setSelectedRole(null);
    setAgreedRate('');
    setDayType('basic_working');
    wrapManualRef.current = false;
    setShowTravel(false);
    setShowEquipmentSection(false);
    setShowExpensesSection(false);
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
    setEquipmentValue('0');
    setEquipmentDiscount('0');
    setExpensesDayAmount('');
    setExpensesDayNotes('');
    setPreviousWrap('');
  };

  // Start a fresh day for a given date, carrying role/rate/project across
  const handleAddNewDay = (date: string) => {
    suppressDirtyRef.current = true;
    wrapManualRef.current = false;
    setShowTravel(false);
    setShowEquipmentSection(false);
    setShowExpensesSection(false);
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
    setEquipmentValue('0');
    setEquipmentDiscount('0');
    setExpensesDayAmount('');
    setExpensesDayNotes('');
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
      grand_total: result.grandTotal + (parseFloat(expensesDayAmount) || 0),
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
      equipment_value: parseFloat(equipmentValue) || 0,
      equipment_discount: parseFloat(equipmentDiscount) || 0,
      expenses_amount: parseFloat(expensesDayAmount) || 0,
      expenses_notes: expensesDayNotes.trim(),
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
      setLastSavedAt(new Date());
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
        {/* + Add Day button — always visible at top for quick access */}
        {projectId && currentDayId && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => handleAddNewDay(format(addDays(parseISO(workDate), 1), 'yyyy-MM-dd'))}
          >
            <Plus className="h-4 w-4" /> Add New Day
          </Button>
        )}

        <Card>
          <CardHeader className="hidden md:block pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <PoundSterling className="h-4 w-4" />
              Crew Rate Calculator
              {currentDayId && (
                <Badge variant="outline" className="ml-2 text-xs font-normal">Editing saved day</Badge>
              )}
            </CardTitle>
          </CardHeader>
          {/* Mobile: compact editing badge only */}
          {currentDayId && (
            <div className="md:hidden px-4 pt-3 pb-0">
              <Badge variant="outline" className="text-xs font-normal">Editing saved day</Badge>
            </div>
          )}
          <CardContent className="space-y-6">
            {/* Project Name */}
            <div className="space-y-2">
              <Label htmlFor="project">Job Name</Label>
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
                        <p className="text-xs font-semibold text-muted-foreground">Switch to job</p>
                      </div>
                      {allProjects.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground text-center">No jobs yet</div>
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="rate">Day Rate</Label>
                  {selectedRole && agreedRate && !selectedRole.isBuyout && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64 px-4 py-3 text-sm space-y-2">
                        <p className="font-medium text-foreground">Rate Breakdown</p>
                        {selectedRole.isCustom ? (
                          <div className="space-y-1 text-muted-foreground">
                            <p>Custom grade · OT x{selectedRole.otCoefficient}</p>
                            <p>BHR: <strong className="text-foreground">£{selectedRole.customBhr ?? Math.round(parseInt(agreedRate) / 10)}/hr</strong></p>
                            {selectedRole.otCoefficient > 0 && (
                              <p>OT rate: <strong className="text-foreground">£{Math.round((selectedRole.customBhr ?? Math.round(parseInt(agreedRate) / 10)) * selectedRole.otCoefficient)}/hr</strong></p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1 text-muted-foreground">
                            <p>BHR: <strong className="text-foreground">£{Math.round(parseInt(agreedRate) / 10)}/hr</strong> <span className="text-xs">(1/10 of day rate)</span></p>
                            {selectedRole.otGrade !== 'N/A' && (
                              <>
                                <p>OT Grade: <strong className="text-foreground">{selectedRole.otGrade}</strong> (x{selectedRole.otCoefficient})</p>
                                <p>OT rate: <strong className="text-foreground">£{Math.round(Math.round(parseInt(agreedRate) / 10) * selectedRole.otCoefficient)}/hr</strong></p>
                              </>
                            )}
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
                  <Input id="rate" type="number" className="pl-7" value={agreedRate} onChange={e => setAgreedRate(e.target.value)} placeholder={selectedRole ? `${selectedRole.minRate || '—'} - ${selectedRole.maxRate || '—'}` : 'Select role first'} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Day Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="workDate">Date</Label>
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
            </div>

            {(() => {
              const hasTimes = !!(callTime && wrapTime);
              let isUnderMin = false;
              let hrs = 0, mins = 0, effectiveHrs = 0;
              if (hasTimes) {
                let callMins = parseInt(callTime.split(':')[0]) * 60 + parseInt(callTime.split(':')[1]);
                let wrapMins = parseInt(wrapTime.split(':')[0]) * 60 + parseInt(wrapTime.split(':')[1]);
                if (wrapMins <= callMins) wrapMins += 24 * 60;
                const totalHrs = (wrapMins - callMins) / 60;
                effectiveHrs = dayType === 'travel' ? Math.max(totalHrs, 5) : totalHrs;
                hrs = Math.floor(totalHrs);
                mins = Math.round((totalHrs - hrs) * 60);
                isUnderMin = dayType === 'travel' && totalHrs < 5;
              }
              const showInfo = hasTimes || dayType === 'travel';
              const infoAddon = showInfo ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={`flex items-center justify-center h-5 w-5 rounded-full transition-colors ${isUnderMin ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground/30 hover:text-muted-foreground/70'}`}>
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 px-4 py-3 text-sm text-muted-foreground space-y-2">
                    {dayType === 'travel' && (
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">Travel Day Rules</p>
                        <p>Minimum 5 hours, paid at Basic Hourly Rate (single time). Applies any day of the week. Not applicable to PM, PA, or Runners.</p>
                      </div>
                    )}
                    {hasTimes && (
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{dayType === 'travel' ? 'Travel Duration' : 'Day Length'}</p>
                        {isUnderMin ? (
                          <>
                            <p>Actual duration: <strong className="text-foreground">{hrs}h{mins > 0 ? ` ${mins}m` : ''}</strong></p>
                            <p>Travel days have a <strong className="text-foreground">5-hour minimum</strong>. This day will be billed at <strong className="text-foreground">{effectiveHrs}h</strong>.</p>
                          </>
                        ) : (
                          <p>Total from {dayType === 'travel' ? 'departure to arrival' : 'call to wrap'}: <strong className="text-foreground">{hrs}h{mins > 0 ? ` ${mins}m` : ''}</strong></p>
                        )}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              ) : null;
              return (
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-end">
                  <TimePicker
                    label={dayType === 'travel' ? 'Departure Time' : 'Call Time'}
                    value={callTime}
                    onChange={(v) => {
                      setCallTime(v);
                      if (!wrapManualRef.current) {
                        const defaultHours = DEFAULT_WRAP_HOURS[dayType];
                        if (defaultHours !== undefined) setWrapTime(addHoursToTime(v, defaultHours));
                      }
                    }}
                  />
                  <div className="flex items-center pb-2 text-muted-foreground text-sm">→</div>
                  <TimePicker
                    label={dayType === 'travel' ? 'Arrival Time' : 'Wrap Time'}
                    labelAddon={infoAddon}
                    value={wrapTime}
                    onChange={(v) => { wrapManualRef.current = true; setWrapTime(v); }}
                  />
                </div>
              );
            })()}

            <Separator />

            {/* Breaks */}
            {(dayType === 'basic_working' || dayType === 'continuous_working' || dayType === 'prep' || dayType === 'recce' || dayType === 'build_strike' || dayType === 'pre_light') && (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Breaks & Penalties</h3>
                    <a
                      href="https://www.a-p-a.net/apa-crew-terms/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors font-mono"
                      title="APA Recommended Terms for Crew 2025"
                    >
                      APA T&Cs ↗
                    </a>
                  </div>

                  {/* Non-shooting day breaks (prep/recce/build_strike/pre_light) */}
                  {(dayType === 'prep' || dayType === 'recce' || dayType === 'build_strike' || dayType === 'pre_light') && (
                    <div className="rounded-2xl border px-4 py-3 space-y-2.5">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="nsdBreak"
                          checked={firstBreakGiven}
                          onCheckedChange={v => setFirstBreakGiven(!!v)}
                        />
                        <Label htmlFor="nsdBreak" className="font-medium text-sm flex-1">
                          Break given
                          <span className="text-muted-foreground font-normal">
                            {dayType === 'pre_light' ? ' (1 hr lunch included)' : ' (at producer\'s discretion)'}
                          </span>
                        </Label>
                      </div>
                      <p className="ml-7 text-xs text-muted-foreground">
                        {firstBreakGiven
                          ? dayType === 'pre_light'
                            ? 'OT starts after 9 hours (8hrs + 1hr lunch)'
                            : 'OT starts after 9 hours (8hrs + 1hr break)'
                          : 'OT starts after 8 hours (no break given)'
                        }
                      </p>
                      {dayType === 'pre_light' && !firstBreakGiven && (
                        <p className="ml-7 text-xs text-orange-600">£7.50 meal allowance applies if meal not provided</p>
                      )}
                    </div>
                  )}

                  {dayType === 'basic_working' && (
                    <div className="space-y-2">
                      {/* Break 1 */}
                      <div className="rounded-2xl border px-4 py-3 space-y-2.5">
                        <div className="flex items-center gap-3">
                          <Checkbox id="break1" checked={firstBreakGiven} onCheckedChange={v => setFirstBreakGiven(!!v)} />
                          <Label htmlFor="break1" className="font-medium text-sm flex-1">1st break <span className="text-muted-foreground font-normal">(1 hr lunch)</span></Label>
                        </div>
                        {firstBreakGiven ? (
                          <div className="ml-7 flex items-center gap-3 flex-wrap">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">Time</span>
                              <input
                                type="time"
                                value={firstBreakTime}
                                onChange={e => { if (e.target.value) setFirstBreakTime(e.target.value); }}
                                className="h-9 w-[110px] rounded-xl border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">Duration</span>
                              <Select value={firstBreakDuration} onValueChange={setFirstBreakDuration}>
                                <SelectTrigger className="h-9 w-[140px] rounded-xl text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="60">60 min (full)</SelectItem>
                                  <SelectItem value="45">45 min (curtailed)</SelectItem>
                                  <SelectItem value="30">30 min (curtailed)</SelectItem>
                                  <SelectItem value="15">15 min (curtailed)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {parseInt(firstBreakDuration) < 60 && (
                              <span className="text-xs text-orange-600">−{60 - parseInt(firstBreakDuration)} min penalty</span>
                            )}
                          </div>
                        ) : (
                          <p className="ml-7 text-xs text-orange-600">Day treated as Continuous Working Day</p>
                        )}
                      </div>

                      {/* Break 2 */}
                      <div className="rounded-2xl border px-4 py-3 space-y-2.5">
                        <div className="flex items-center gap-3">
                          <Checkbox id="break2" checked={secondBreakGiven} onCheckedChange={v => setSecondBreakGiven(!!v)} />
                          <Label htmlFor="break2" className="font-medium text-sm flex-1">2nd break <span className="text-muted-foreground font-normal">(30 min tea)</span></Label>
                        </div>
                        {secondBreakGiven ? (
                          <div className="ml-7 flex items-center gap-3 flex-wrap">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">Time</span>
                              <input
                                type="time"
                                value={secondBreakTime}
                                onChange={e => { if (e.target.value) setSecondBreakTime(e.target.value); }}
                                className="h-9 w-[110px] rounded-xl border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">Duration</span>
                              <Select value={secondBreakDuration} onValueChange={setSecondBreakDuration}>
                                <SelectTrigger className="h-9 w-[140px] rounded-xl text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="30">30 min (full)</SelectItem>
                                  <SelectItem value="20">20 min (curtailed)</SelectItem>
                                  <SelectItem value="15">15 min (curtailed)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {parseInt(secondBreakDuration) < 30 && (
                              <span className="text-xs text-orange-600">−{30 - parseInt(secondBreakDuration)} min penalty</span>
                            )}
                          </div>
                        ) : (
                          <p className="ml-7 text-xs text-orange-600">30 min BHR penalty applies</p>
                        )}
                      </div>
                    </div>
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

            {/* Travel & Mileage — collapsible */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowTravel(v => !v)}
                className="flex items-center gap-2 text-sm font-medium w-full text-left group"
              >
                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showTravel ? 'rotate-90' : ''}`} />
                <Car className="h-3.5 w-3.5" /> Travel & Mileage
                {!showTravel && (parseFloat(travelHours) > 0 || parseFloat(mileage) > 0) && (
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    {parseFloat(travelHours) > 0 && `${travelHours}h`}{parseFloat(mileage) > 0 && ` · ${mileage}mi`}
                  </span>
                )}
              </button>
              {showTravel && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-5">
                  {dayType !== 'travel' && (
                    <div className="space-y-2">
                      <Label className="text-sm">Additional Travel Time</Label>
                      <div className="flex items-center gap-2">
                        <Select value={String(Math.floor(parseFloat(travelHours) || 0))} onValueChange={v => {
                          const mins = (parseFloat(travelHours) || 0) % 1;
                          setTravelHours(String(parseInt(v) + mins));
                        }}>
                          <SelectTrigger className="w-24 rounded-xl text-sm">
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
                          <SelectTrigger className="w-24 rounded-xl text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0 min</SelectItem>
                            <SelectItem value="30">30 min</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-xs text-muted-foreground">Paid at BHR · travel + work ≥ 11hrs</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="mileage" className="text-sm">Miles outside M25</Label>
                    <Input id="mileage" type="number" value={mileage} onChange={e => setMileage(e.target.value)} min="0" placeholder="0" className="rounded-xl" />
                    <p className="text-xs text-muted-foreground">50p/mile · W1F 9SE to location & back</p>
                  </div>
                </div>
              )}
            </div>

            {/* Equipment — collapsible */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowEquipmentSection(v => !v)}
                  className="flex items-center gap-2 text-sm font-medium text-left group"
                >
                  <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showEquipmentSection ? 'rotate-90' : ''}`} />
                  <Package className="h-3.5 w-3.5" /> Equipment
                  {!showEquipmentSection && parseFloat(equipmentValue) > 0 && (
                    <span className="text-xs text-muted-foreground font-normal ml-1">£{equipmentValue}</span>
                  )}
                </button>
                {showEquipmentSection && (
                  <div className="relative" ref={equipmentPickerRef}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => setShowEquipmentPicker(p => !p)}
                    >
                      Load package <ChevronDown className="h-3 w-3" />
                    </Button>
                    {showEquipmentPicker && (
                      <div className="absolute right-0 top-9 w-64 rounded-2xl border border-border bg-white shadow-xl z-50 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-border/40">
                          <p className="text-xs font-semibold text-muted-foreground">Saved equipment packages</p>
                        </div>
                        {equipmentPackages.length === 0 ? (
                          <div className="px-4 py-4 text-xs text-muted-foreground text-center">
                            No packages yet.{' '}
                            <button className="underline text-foreground" onClick={() => { setShowEquipmentPicker(false); navigate('/settings'); }}>
                              Add one in Settings →
                            </button>
                          </div>
                        ) : (
                          <div className="max-h-52 overflow-y-auto py-1">
                            {equipmentPackages.map(pkg => (
                              <button
                                key={pkg.id}
                                onClick={() => { setEquipmentValue(String(pkg.day_rate)); setEquipmentDiscount('0'); setShowEquipmentPicker(false); }}
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary/5 transition-colors flex items-center justify-between gap-2"
                              >
                                <span className="font-medium truncate">{pkg.name}</span>
                                <span className="font-mono text-xs text-muted-foreground shrink-0">£{pkg.day_rate}/day</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {showEquipmentSection && (
              <div className="grid grid-cols-2 gap-3 pl-5">
                <div className="space-y-2">
                  <Label htmlFor="equipment-value" className="text-sm">Value (£)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">£</span>
                    <Input
                      id="equipment-value"
                      type="number"
                      value={equipmentValue}
                      onChange={e => setEquipmentValue(e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className="pl-7 rounded-xl"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="equipment-discount" className="text-sm">Discount (%)</Label>
                  <div className="relative">
                    <Input
                      id="equipment-discount"
                      type="number"
                      value={equipmentDiscount}
                      onChange={e => setEquipmentDiscount(e.target.value)}
                      min="0"
                      max="100"
                      placeholder="0"
                      className="rounded-xl"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  </div>
                  {parseFloat(equipmentDiscount) > 0 && parseFloat(equipmentValue) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      = <span className="font-mono font-medium text-foreground">
                        £{(parseFloat(equipmentValue) * (1 - parseFloat(equipmentDiscount) / 100)).toFixed(2)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
              )}
            </div>

            {/* Expenses — collapsible */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowExpensesSection(v => !v)}
                className="flex items-center gap-2 text-sm font-medium text-left"
              >
                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showExpensesSection ? 'rotate-90' : ''}`} />
                <Receipt className="h-3.5 w-3.5" /> Expenses
                {!showExpensesSection && expensesDayAmount && (
                  <span className="text-xs text-muted-foreground font-normal ml-1">£{expensesDayAmount}</span>
                )}
              </button>
              {showExpensesSection && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-5">
                <div className="space-y-2">
                  <Label htmlFor="expenses-amount">Amount (£)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">£</span>
                    <Input
                      id="expenses-amount"
                      type="number"
                      className="pl-7"
                      value={expensesDayAmount}
                      onChange={e => setExpensesDayAmount(e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expenses-notes" className="text-sm">Description</Label>
                  <Input
                    id="expenses-notes"
                    value={expensesDayNotes}
                    onChange={e => setExpensesDayNotes(e.target.value)}
                    placeholder="e.g. Parking, taxi, meals…"
                    className="rounded-xl"
                  />
                </div>
              </div>
              )}
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
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={`flex items-center gap-1 text-xs transition-colors w-fit ${isTOC ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground/40 hover:text-muted-foreground/70'}`}>
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      <span>{isTOC ? 'TOC penalty applies' : 'Rest gap OK'}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 px-4 py-3 text-sm text-muted-foreground space-y-1.5">
                    <p className="font-medium text-foreground">Time Off The Clock</p>
                    <p>Prev wrap <strong className="text-foreground">{autoPreviousWrap}</strong> → today's call <strong className="text-foreground">{callTime}</strong> = <strong className="text-foreground">{gapHrs}h{gapMins > 0 ? ` ${gapMins}m` : ''}</strong> rest gap</p>
                    {isTOC
                      ? <p className="text-amber-600">Under the 11-hour minimum rest — a 1-hour TOC penalty at OT rate is added automatically.</p>
                      : <p>Rest gap meets the 11-hour minimum. No penalty.</p>
                    }
                  </PopoverContent>
                </Popover>
              );
            })()}

            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reset
              </Button>
              {result && projectId && (
                <Button variant="secondary" onClick={handleAddDay} disabled={saving}>
                  <Plus className="h-4 w-4 mr-1" /> Add New Day
                </Button>
              )}
              {/* Save status indicator */}
              {result && (
                <div className="flex items-center gap-1.5 text-sm ml-auto">
                  {saving ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Cloud className="h-3.5 w-3.5 animate-pulse" /> Saving…
                    </span>
                  ) : lastSavedAt ? (
                    <span className="flex items-center gap-1.5 text-green-600">
                      <Check className="h-3.5 w-3.5" /> Saved
                    </span>
                  ) : (
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      <Save className="h-3.5 w-3.5 mr-1" />
                      {currentDayId ? 'Update Day' : 'Save Day'}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Mobile sticky save bar */}
            {result && (
              <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-safe">
                <div className={`mx-auto max-w-lg mb-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-lg text-sm font-medium transition-colors ${
                  saving ? 'bg-muted text-muted-foreground' :
                  lastSavedAt ? 'bg-green-50 text-green-700 border border-green-200' :
                  'bg-[#1F1F21] text-white'
                }`}>
                  {saving ? (
                    <><Cloud className="h-4 w-4 animate-pulse" /><span>Saving…</span></>
                  ) : lastSavedAt ? (
                    <><Check className="h-4 w-4" /><span>Saved</span></>
                  ) : (
                    <><Save className="h-4 w-4" /><span>{currentDayId ? 'Not saved yet — tap to save' : 'Not saved yet — tap to save'}</span></>
                  )}
                  {!saving && !lastSavedAt && (
                    <button onClick={handleSave} className="bg-[#FFD528] text-[#1F1F21] rounded-xl px-3 py-1 text-xs font-semibold">
                      Save
                    </button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Results Panel */}
      <div className="space-y-4">
        {/* Project Calendar — always visible */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" /> Job Days
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
                Save your first day to start tracking job days.
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
                expensesAmount?: number;
                expensesNotes?: string;
              }> = [
                ...savedOthers.map(d => ({
                  key: d.id,
                  work_date: d.work_date,
                  role_name: d.role_name,
                  grand_total: d.grand_total,
                  isCurrent: false,
                  rj: d.result_json,
                  expensesAmount: d.expenses_amount,
                  expensesNotes: d.expenses_notes,
                })),
                {
                  key: currentKey,
                  work_date: workDate,
                  role_name: selectedRole?.role ?? '—',
                  grand_total: result.grandTotal + (parseFloat(expensesDayAmount) || 0),
                  isCurrent: true,
                  expensesAmount: parseFloat(expensesDayAmount) || 0,
                  expensesNotes: expensesDayNotes,
                  rj: {
                    lineItems: result.lineItems,
                    penalties: result.penalties,
                    subtotal: result.subtotal,
                    travelPay: result.travelPay,
                    mileage: result.mileage,
                    mileageMiles: result.mileageMiles,
                    equipmentValue: result.equipmentValue,
                    equipmentDiscount: result.equipmentDiscount,
                    equipmentTotal: result.equipmentTotal,
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
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span className="font-mono text-sm font-semibold">
                              £{(day.grand_total || 0).toFixed(2)}
                            </span>
                            {!day.isCurrent && (
                              <button
                                onClick={e => { e.stopPropagation(); removeDay(day.key); }}
                                className="p-1 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Remove day"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
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

                            {/* Equipment */}
                            {(rj.equipmentTotal ?? 0) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Equipment{(rj.equipmentDiscount ?? 0) > 0 ? ` (−${rj.equipmentDiscount}%)` : ''}
                                </span>
                                <span className="font-mono text-xs">£{(rj.equipmentTotal ?? 0).toFixed(2)}</span>
                              </div>
                            )}

                            {/* Expenses */}
                            {(day.expensesAmount ?? 0) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Expenses{day.expensesNotes ? ` (${day.expensesNotes})` : ''}
                                </span>
                                <span className="font-mono text-xs">£{(day.expensesAmount ?? 0).toFixed(2)}</span>
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
                        <span>Job Total</span>
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
