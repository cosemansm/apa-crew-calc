import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Save, RotateCcw, Calculator, CalendarDays, Star, Plus, FileText as InvoiceIcon, ChevronLeft, ChevronRight, Pencil, FolderOpen, Package, ChevronDown, Trash2, Receipt, Info, Check, Cloud, Car, Send } from 'lucide-react';
import { format, getDay, addDays, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { useEngine } from '@/hooks/useEngine';
import type { EngineRole, EngineResult } from '@/engines/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { cn } from '@/lib/utils';
import { getUKBankHolidays } from '@/lib/bankHolidays';

const JS_DAY_TO_DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
  bank_holiday: 'Bank Holiday',
};

function dateToDayOfWeek(dateStr: string): string {
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
const DEFAULT_WRAP_HOURS: Record<string, number> = {
  basic_working: 11,     // 10h working + 1h lunch
  continuous_working: 9, // 9h continuous (no lunch)
  prep: 8,               // 8h base
  recce: 8,
  build_strike: 8,
  pre_light: 9,          // 8h + 1h lunch included
  travel: 5,             // min 5h per APA S.3.1 / S.2.4(xiii)(xiv)
  // rest: no default — flat fee, times irrelevant
};


function TimePicker({ value, onChange, label, labelAddon, triggerClassName, showNextDay, isNextDay, onNextDayChange }: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  labelAddon?: React.ReactNode;
  triggerClassName?: string;
  showNextDay?: boolean;
  isNextDay?: boolean;
  onNextDayChange?: (v: boolean) => void;
}) {
  const safe = /^\d{2}:\d{2}$/.test(value) ? value : '08:00';
  const [hh, mm] = safe.split(':').map(Number);
  const [open, setOpen] = useState(false);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const selectHour = (hour: number) => {
    onChange(`${String(hour).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  };
  const selectMinute = (minute: number) => {
    onChange(`${String(hh).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <Label className="text-sm">{label}</Label>
          {labelAddon}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-10 w-full items-center justify-between rounded-2xl border border-input bg-background px-3 py-2 text-sm font-mono font-semibold tracking-wider hover:border-[#FFD528] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isNextDay && 'border-[#FFD528] bg-amber-50',
              triggerClassName
            )}
          >
            <span>
              {safe}
              {isNextDay && (
                <span className="ml-1.5 text-[9px] font-bold bg-[#FFD528] text-[#1F1F21] rounded px-1 py-0.5 align-middle tracking-normal">+1</span>
              )}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          {showNextDay && (
            <div className="flex bg-muted rounded-lg p-0.5 gap-0.5 mb-3">
              <button
                type="button"
                onClick={() => onNextDayChange?.(false)}
                className={cn('flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', !isNextDay ? 'bg-[#1F1F21] text-[#FFD528]' : 'text-muted-foreground hover:text-foreground')}
              >
                Same Day
              </button>
              <button
                type="button"
                onClick={() => onNextDayChange?.(true)}
                className={cn('flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', isNextDay ? 'bg-[#FFD528] text-[#1F1F21]' : 'text-muted-foreground hover:text-foreground')}
              >
                Next Day +1
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Hour</p>
              <div className="grid grid-cols-4 gap-1">
                {hours.map(hour => (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => selectHour(hour)}
                    className={cn(
                      'w-9 h-7 rounded-lg text-xs font-semibold transition-colors',
                      hour === hh
                        ? 'bg-[#1F1F21] text-[#FFD528]'
                        : 'border border-transparent hover:border-[#FFD528] text-foreground'
                    )}
                  >
                    {String(hour).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-px bg-border" />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Min</p>
              <div className="grid grid-cols-3 gap-1">
                {minutes.map(minute => (
                  <button
                    key={minute}
                    type="button"
                    onClick={() => selectMinute(minute)}
                    className={cn(
                      'w-9 h-7 rounded-lg text-xs font-semibold transition-colors',
                      minute === mm
                        ? 'bg-[#1F1F21] text-[#FFD528]'
                        : 'border border-transparent hover:border-[#FFD528] text-foreground'
                    )}
                  >
                    {String(minute).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface DayResultJson {
  lineItems?: { description: string; hours?: number; rate?: number; total: number; timeFrom?: string; timeTo?: string; isDayRate?: boolean }[];
  penalties?: { description: string; hours?: number; rate?: number; total: number }[];
  subtotal?: number;
  travelPay?: number;
  mileage?: number;
  mileageMiles?: number;
  equipmentValue?: number;
  equipmentDiscount?: number;
  equipmentTotal?: number;
  dayDescription?: string;
}

interface ProjectDaySummary {
  id: string;
  work_date: string;
  role_name: string;
  grand_total: number;
  day_number: number;
  day_type?: string;
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
  currency,
}: {
  projectDays: ProjectDaySummary[];
  selectedDate: string;
  calendarMonth: Date;
  onMonthChange: (d: Date) => void;
  onSelectDay?: (dayId: string) => void;
  onAddDate: (date: string) => void;
  currency: string; // caller always passes activeEngine.meta.currencySymbol
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
                title={isBooked ? `${dayByDate[dateStr].role_name} — ${currency}${(dayByDate[dateStr].grand_total || 0).toFixed(0)}` : 'Add day'}
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
            {currency}{projectDays.reduce((s, d) => s + (d.grand_total || 0), 0).toFixed(0)}
          </span>
        </div>
      )}
    </div>
  );
}

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
  wrapNextDay: boolean;
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
  usePageTitle('Rate Calculator');
  const { user } = useAuth();
  const { isPremium } = useSubscription();
  const { activeEngine, setJobEngine, showEngineSelector, authorizedEngines, defaultEngineId } = useEngine();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const projectNameFromUrl = searchParams.get('name');
  const dateFromUrl = searchParams.get('date');
  const navigate = useNavigate();

  // Try to restore from session on first mount.
  // Only restore if the URL project matches the session (page refresh of a specific job).
  // A clean navigation to /calculator (no ?project=) always starts fresh.
  const sessionRef = useRef(loadSession());
  const hasUrlProject = !!searchParams.get('project');
  const sessionMatchesUrl = sessionRef.current?.projectId === searchParams.get('project');
  const ss = (sessionMatchesUrl && sessionRef.current) ? sessionRef.current : null;
  const restoredFromSession = useRef(!!ss);

  const [selectedRole, setSelectedRole] = useState<EngineRole | null>(null);
  const [agreedRate, setAgreedRate] = useState<string>(ss?.agreedRate ?? '');
  const [dayType, setDayType] = useState<string>(ss?.dayType ?? 'basic_working');
  const [workDate, setWorkDate] = useState(ss?.workDate ?? dateFromUrl ?? format(new Date(), 'yyyy-MM-dd'));
  const [isBankHoliday, setIsBankHoliday] = useState(ss?.isBankHoliday ?? false);
  const [bankHolidays, setBankHolidays] = useState<Set<string>>(new Set());
  const [callTime, setCallTime] = useState(ss?.callTime ?? '08:00');
  const [wrapTime, setWrapTime] = useState(ss?.wrapTime ?? '19:00');
  const [wrapNextDay, setWrapNextDay] = useState(ss?.wrapNextDay ?? false);
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
  const [saveError, setSaveError] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [favouriteRoles, setFavouriteRoles] = useState<string[]>([]);
  const [customRoles, setCustomRoles] = useState<EngineRole[]>([]);
  // SDYM engine state
  const [hasEquipment, setHasEquipment] = useState(false);
  const [kmRate, setKmRate] = useState(0.43);
  // T&Cs engine selector (for new job creation)
  const [selectedCalcEngine, setSelectedCalcEngine] = useState(defaultEngineId);

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
  const suppressDirtyRef = useRef(true); // Suppress initial dirty flag on mount
  const autoSaveNewDayRef = useRef(false);
  // When loadDayIntoForm runs before customRoles loads, store the pending role/rate here
  const pendingRoleNameRef = useRef<string | null>(null);
  const pendingAgreedRateRef = useRef<string | null>(null);

  // Unsaved changes tracking
  const [isDirty, setIsDirty] = useState(false); // Never restore from session — always clean on load/refresh
  // Pending within-page navigation when user has unsaved changes
  const [pendingDayId, setPendingDayId] = useState<string | null>(null);

  // Miscalculation report
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reportShareData, setReportShareData] = useState(false);
  const [reportAgreeTerms, setReportAgreeTerms] = useState(false);
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

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

  // Clean up job engine override when leaving this page
  useEffect(() => {
    return () => { setJobEngine(null); };
  }, [setJobEngine]);

  // Restore selected role from session on mount (using engine roles)
  useEffect(() => {
    const name = ss?.selectedRoleName;
    if (name && !selectedRole) {
      const role = activeEngine.getRole(name);
      if (role) {
        suppressDirtyRef.current = true;
        setSelectedRole(role);
      }
    }
  }, [activeEngine]); // eslint-disable-line react-hooks/exhaustive-deps

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
      wrapNextDay,
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

  // Fetch UK bank holidays once on mount, cache for 7 days
  useEffect(() => {
    getUKBankHolidays().then(setBankHolidays);
  }, []);

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
          const mapped: EngineRole[] = data.map(r => ({
            role: r.role_name,
            department: 'Custom',
            minRate: r.daily_rate,
            maxRate: r.daily_rate,
            engineData: {
              otGrade: 'N/A',
              otCoefficient: r.ot_coefficient,
              customBhr: r.custom_bhr ?? undefined,
            },
            isCustom: true,
            customId: r.id,
            isBuyout: r.is_buyout ?? false,
          }));
          setCustomRoles(mapped);
          // If loadDayIntoForm ran before custom roles loaded, retry the role lookup now
          if (pendingRoleNameRef.current && pendingAgreedRateRef.current) {
            const found = mapped.find(r => r.role === pendingRoleNameRef.current);
            if (found) {
              suppressDirtyRef.current = true;
              setSelectedRole(found);
              setAgreedRate(pendingAgreedRateRef.current);
              pendingRoleNameRef.current = null;
              pendingAgreedRateRef.current = null;
            }
          }
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

  // Load project engine + days & auto-load last day when entering a project.
  // Engine must be set BEFORE loading a day so the calculator uses the right engine.
  useEffect(() => {
    if (!projectId) { setJobEngine(null); return; }
    (async () => {
      // 1. Set engine first so subsequent calculation uses the correct one
      const { data: proj } = await supabase.from('projects')
        .select('calc_engine')
        .eq('id', projectId)
        .single();
      if (proj) setJobEngine(proj.calc_engine ?? null);

      // 2. Load project days
      const { data } = await supabase.from('project_days')
        .select('id, work_date, role_name, grand_total, day_number, day_type, result_json, wrap_time, call_time, expenses_amount, expenses_notes')
        .eq('project_id', projectId)
        .order('work_date', { ascending: true });
      if (data) {
        setProjectDays(data as ProjectDaySummary[]);
        // Sync calendar to the month of the first job day so booked dates are visible
        if (data.length > 0) {
          setCalendarMonth(new Date(data[0].work_date + 'T00:00:00'));
        }
        // Skip auto-load only if session has meaningful state (role + rate are populated).
        // If the session is stale/incomplete (e.g. role missing due to a prior race condition),
        // still trigger auto-load so the form isn't left blank.
        if (restoredFromSession.current) {
          restoredFromSession.current = false;
          const sessionHasRole = !!(sessionRef.current?.selectedRoleName && sessionRef.current?.agreedRate);
          if (sessionHasRole) return;
        }
        // If there are saved days, auto-load the most recent one
        if (data.length > 0) {
          const lastDay = data[data.length - 1];
          loadDayById(lastDay.id);
        }
      }
    })();
  }, [projectId, setJobEngine]);

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

  const dayOfWeek: string = useMemo(() => {
    if (bankHolidays.has(workDate)) return 'bank_holiday';
    return dateToDayOfWeek(workDate);
  }, [workDate, bankHolidays]);

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

  // When wrap crosses midnight, encode hours > 24 so the engine sees the true duration.
  // e.g. wrapTime "02:30" + wrapNextDay → effectiveWrapTime "26:30"
  const effectiveWrapTime = useMemo(() => {
    if (!wrapNextDay) return wrapTime;
    const [h, m] = wrapTime.split(':');
    return `${String(parseInt(h) + 24).padStart(2, '0')}:${m}`;
  }, [wrapTime, wrapNextDay]);

  const result: EngineResult | null = useMemo(() => {
    if (!selectedRole) return null;
    // SDYM engine derives its own rate; other engines require a positive agreed rate
    const rate = parseInt(agreedRate) || 0;
    if (activeEngine.meta.features.agreedRateInput && (isNaN(rate) || rate <= 0)) return null;

    return activeEngine.calculate({
      role: selectedRole,
      agreedDailyRate: rate,
      dayType,
      dayOfWeek,
      callTime,
      wrapTime: effectiveWrapTime,
      firstBreakGiven,
      firstBreakTime: firstBreakGiven ? firstBreakTime : undefined,
      firstBreakDurationMins: parseInt(firstBreakDuration) || 60,
      secondBreakGiven,
      secondBreakTime: secondBreakGiven ? secondBreakTime : undefined,
      secondBreakDurationMins: parseInt(secondBreakDuration) || 30,
      continuousFirstBreakGiven,
      continuousAdditionalBreakGiven,
      travelHours: parseFloat(travelHours) || 0,
      mileageDistance: parseFloat(mileage) || 0,
      previousWrapTime: autoPreviousWrap || undefined,
      equipmentValue: parseFloat(equipmentValue) || 0,
      equipmentDiscount: parseFloat(equipmentDiscount) || 0,
      extra: !activeEngine.meta.features.agreedRateInput
        ? { hasEquipment, kmRate }
        : undefined,
    });
  }, [selectedRole, agreedRate, dayType, dayOfWeek, callTime, effectiveWrapTime, firstBreakGiven, firstBreakTime, firstBreakDuration, secondBreakGiven, secondBreakTime, secondBreakDuration, continuousFirstBreakGiven, continuousAdditionalBreakGiven, travelHours, mileage, autoPreviousWrap, workDate, isBankHoliday, equipmentValue, equipmentDiscount, activeEngine, hasEquipment, kmRate]);

  // Mark dirty whenever the calculated result changes (but not during load/reset)
  useEffect(() => {
    if (suppressDirtyRef.current) {
      suppressDirtyRef.current = false;
      return;
    }
    if (result !== null) setIsDirty(true);
  }, [result]);

  // Heal stale grand_total: when a saved day is loaded and the live result
  // differs from the stored value (e.g. after engine bug fixes or a previous
  // day's wrap time changed), silently update the DB so collapsed days always
  // show the correct total without requiring the user to manually re-save.
  useEffect(() => {
    if (!currentDayId || !result || isDirty || !projectId) return;
    const stored = projectDays.find(d => d.id === currentDayId);
    if (!stored) return;
    const liveTotal = result.grandTotal + (parseFloat(expensesDayAmount) || 0);
    if (Math.abs(liveTotal - stored.grand_total) < 0.005) return;
    supabase.from('project_days')
      .update({ grand_total: liveTotal, result_json: result })
      .eq('id', currentDayId)
      .then(() => refreshProjectDays(projectId));
  }, [currentDayId, result]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save: fires 1.5s after result changes, when minimum fields are ready ──
  useEffect(() => {
    if (!result || !user || !selectedRole || !isDirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      await handleSave();
    }, 5000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRoleChange = (roleName: string) => {
    // Search custom roles first, then engine roles
    const custom = customRoles.find(r => r.role === roleName);
    if (custom) {
      setSelectedRole(custom);
      if (custom.maxRate) setAgreedRate(custom.maxRate.toString());
      return;
    }
    const role = activeEngine.getRole(roleName);
    setSelectedRole(role || null);
    if (role?.maxRate) {
      setAgreedRate(role.maxRate.toString());
    }
  };

  const handleDayTypeChange = (newType: string) => {
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
    setDayType(day.day_type);
    setCallTime(day.call_time);
    // Decode next-day wrap: hours ≥ 24 means it was saved as an over-midnight wrap
    const rawWrapHr = parseInt(day.wrap_time.split(':')[0]);
    if (rawWrapHr >= 24) {
      setWrapNextDay(true);
      setWrapTime(`${String(rawWrapHr - 24).padStart(2, '0')}:${day.wrap_time.split(':')[1]}`);
    } else {
      setWrapNextDay(false);
      setWrapTime(day.wrap_time);
    }
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
    const role = customRoles.find(r => r.role === day.role_name) ?? activeEngine.getRole(day.role_name);
    if (role) {
      setSelectedRole(role);
      setAgreedRate(String(day.agreed_rate));
      pendingRoleNameRef.current = null;
      pendingAgreedRateRef.current = null;
    } else {
      // customRoles may not have loaded yet — stash for retry when they arrive
      pendingRoleNameRef.current = day.role_name;
      pendingAgreedRateRef.current = String(day.agreed_rate);
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
      .select('id, work_date, role_name, grand_total, day_number, day_type, result_json, wrap_time, call_time, expenses_amount, expenses_notes')
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
    setDayType(activeEngine.dayTypes[0]?.value ?? 'basic_working');
    wrapManualRef.current = false;
    setShowTravel(false);
    setShowEquipmentSection(false);
    setShowExpensesSection(false);
    setWorkDate(format(new Date(), 'yyyy-MM-dd'));
    setIsBankHoliday(false);
    setCallTime('08:00');
    setWrapTime('19:00');
    setWrapNextDay(false);
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
    setDayType(activeEngine.dayTypes[0]?.value ?? 'basic_working');
    setCallTime('08:00');
    setWrapTime('19:00');
    setWrapNextDay(false);
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
    setSaveError(false);

    // Resolve or create a project
    let resolvedProjectId = projectId;
    if (!resolvedProjectId) {
      // Enforce 10-job limit for free users
      if (!isPremium) {
        const { count } = await supabase
          .from('projects')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        if ((count ?? 0) >= 10) {
          setSaving(false);
          toast.error('Free plan limit reached — upgrade to Pro for unlimited jobs, or delete an existing job to free a slot.');
          return null;
        }
      }

      const { data: proj, error: projError } = await supabase.from('projects').insert({
        user_id: user.id,
        name: projectName || 'Untitled',
        client_name: null,
        calc_engine: selectedCalcEngine || activeEngine.meta.id,
      }).select().single();
      if (projError || !proj) { setSaving(false); setSaveError(true); return null; }
      resolvedProjectId = proj.id;
    }

    const payload = {
      project_id: resolvedProjectId,
      work_date: workDate,
      role_name: selectedRole.role,
      department: selectedRole.department,
      agreed_rate: parseInt(agreedRate) || 0,
      day_type: dayType,
      day_of_week: dayOfWeek,
      call_time: callTime,
      wrap_time: effectiveWrapTime,
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
      ...(equipmentValue ? { equipment_value: parseFloat(equipmentValue) || 0 } : {}),
      ...(equipmentDiscount ? { equipment_discount: parseFloat(equipmentDiscount) || 0 } : {}),
      expenses_amount: parseFloat(expensesDayAmount) || 0,
      expenses_notes: expensesDayNotes.trim(),
      previous_wrap: autoPreviousWrap || null,
      is_bank_holiday: bankHolidays.has(workDate),
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
      // Guard: prevent duplicate date within same job (query DB to avoid stale state)
      const { count: existingCount } = await supabase.from('project_days')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', resolvedProjectId)
        .eq('work_date', workDate);
      if (existingCount && existingCount > 0) {
        setSaving(false);
        setSaveError(true);
        return null;
      }

      // INSERT new day — use MAX(day_number) to handle gaps from deletions correctly
      const { data: maxRow } = await supabase.from('project_days')
        .select('day_number')
        .eq('project_id', resolvedProjectId)
        .order('day_number', { ascending: false })
        .limit(1)
        .single();
      const nextDayNumber = (maxRow?.day_number ?? 0) + 1;
      const { data, error } = await supabase.from('project_days').insert({
        ...payload,
        day_number: nextDayNumber,
      }).select('id').single();
      if (!error && data) {
        savedId = data.id;
        setCurrentDayId(data.id);
      }
    }

    setSaving(false);
    if (savedId && resolvedProjectId) {
      setSaveSuccess(true);
      setSaveError(false);
      setIsDirty(false);
      setLastSavedAt(new Date());
      await refreshProjectDays(resolvedProjectId);
    } else {
      setSaveError(true);
    }
    return savedId;
  };

  // Returns the next date after `fromDate` that is not already booked in this job.
  // `extraBooked` lets callers include dates not yet reflected in `projectDays` state.
  const nextAvailableDate = (fromDate: string, extraBooked?: string[]): string => {
    const booked = new Set(projectDays.map(d => d.work_date));
    if (extraBooked) extraBooked.forEach(d => booked.add(d));
    let candidate = parseISO(fromDate);
    do {
      candidate = addDays(candidate, 1);
    } while (booked.has(format(candidate, 'yyyy-MM-dd')));
    return format(candidate, 'yyyy-MM-dd');
  };

  const handleAddDay = async () => {
    if (!result || !user || !selectedRole) return;
    const savedId = await handleSave();
    // Only proceed to a fresh form if the save succeeded
    if (!savedId) return;
    handleAddNewDay(nextAvailableDate(workDate, [workDate]));
    // After all state updates from handleAddNewDay settle, mark the new day dirty
    // so the "Unsaved changes" banner appears and the day won't be silently lost.
    setTimeout(() => {
      suppressDirtyRef.current = false;
      setIsDirty(true);
    }, 0);
  };

  const handleSendReport = async () => {
    if (!reportMessage.trim()) { setReportError('Please describe the issue'); return; }
    if (!reportAgreeTerms) { setReportError('Please agree to the Terms & Conditions to continue'); return; }
    setReportSending(true);
    setReportError(null);
    try {
      const calcSnapshot = reportShareData && result ? JSON.stringify({
        role: selectedRole,
        agreedRate,
        dayType,
        callTime,
        wrapTime,
        dayOfWeek,
        result,
      }, null, 2) : null;
      const message = calcSnapshot
        ? `${reportMessage.trim()}\n\n--- Calculation Data (shared with consent) ---\n${calcSnapshot}`
        : reportMessage.trim();
      const res = await fetch('/api/email/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: user?.user_metadata?.full_name || user?.email || 'Unknown',
          email: user?.email || 'unknown@unknown.com',
          subject: 'Miscalculation Report',
          message,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setReportError(data.error || 'Failed to send'); setReportSending(false); return; }
      setReportSent(true);
      setReportMessage('');
      setReportShareData(false);
      setReportAgreeTerms(false);
      setReportSending(false);
      setTimeout(() => { setReportOpen(false); setReportSent(false); }, 2500);
    } catch (err) {
      setReportError(String(err));
      setReportSending(false);
    }
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
          <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 text-sm ${saveError ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
            <span>{saveError ? '✕ Save failed — tap to retry' : '⚠ Unsaved changes'}</span>
            <Button size="sm" onClick={handleSave} disabled={saving || !result} className="h-7 text-xs">
              {saving ? 'Saving…' : saveError ? 'Retry' : 'Save now'}
            </Button>
          </div>
        )}
        <Card>
          <CardHeader className="hidden md:flex md:flex-row md:items-center md:justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4" />
              Crew Rate Calculator
              {currentDayId && (
                <Badge variant="outline" className="ml-2 text-xs font-normal">Editing saved day</Badge>
              )}
            </CardTitle>
            {projectId && currentDayId && (
              <Button
                size="sm"
                className="bg-[#FFD528] text-[#1F1F21] hover:bg-[#FFD528]/90 font-semibold gap-1.5 shrink-0"
                onClick={handleAddDay}
                disabled={saving}
              >
                <Plus className="h-4 w-4" /> Add New Day
              </Button>
            )}
          </CardHeader>
          {/* Mobile: compact editing badge + add day button */}
          {currentDayId && (
            <div className="md:hidden px-4 pt-3 pb-0 flex items-center justify-between">
              <Badge variant="outline" className="text-xs font-normal">Editing saved day</Badge>
              {projectId && (
                <Button
                  size="sm"
                  className="bg-[#FFD528] text-[#1F1F21] hover:bg-[#FFD528]/90 font-semibold gap-1.5"
                  onClick={handleAddDay}
                  disabled={saving}
                >
                  <Plus className="h-4 w-4" /> Add New Day
                </Button>
              )}
            </div>
          )}
          <CardContent className="space-y-6">
            {/* Project Name */}
            <div className="space-y-2">
              <Label htmlFor="project">Job Name</Label>
              <div className="flex gap-2">
                <Input id="project" placeholder="e.g. Nike Summer Campaign" value={projectName} onChange={e => setProjectName(e.target.value)} className="flex-1" />
                {/* T&Cs engine selector — dropdown for both new and existing jobs */}
                {showEngineSelector && !projectId && (
                  <Select value={selectedCalcEngine} onValueChange={(v) => { setSelectedCalcEngine(v); }}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {authorizedEngines.map(e => (
                        <SelectItem key={e.meta.id} value={e.meta.id}>
                          {e.meta.shortName} ({e.meta.currencySymbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {showEngineSelector && projectId && (
                  <Select value={activeEngine.meta.id} onValueChange={async (v) => {
                    setJobEngine(v);
                    await supabase.from('projects').update({ calc_engine: v }).eq('id', projectId);
                  }}>
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {authorizedEngines.map(e => (
                        <SelectItem key={e.meta.id} value={e.meta.id}>
                          {e.meta.shortName} ({e.meta.currencySymbol})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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
                  {activeEngine.meta.features.favourites && favouriteRoles.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Favourites
                      </SelectLabel>
                      {favouriteRoles.map(roleName => {
                        const role = activeEngine.getRole(roleName);
                        return role ? (
                          <SelectItem key={`fav-${role.role}`} value={role.role}>
                            {role.role}
                          </SelectItem>
                        ) : null;
                      })}
                    </SelectGroup>
                  )}
                  {activeEngine.departments.map(dept => {
                    const deptRoles = activeEngine.getRolesByDepartment(dept).filter(r => !favouriteRoles.includes(r.role));
                    if (deptRoles.length === 0) return null;
                    return (
                      <SelectGroup key={dept}>
                        {deptRoles.length > 1 && <SelectLabel>{dept}</SelectLabel>}
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
              {selectedRole && agreedRate && activeEngine.meta.features.agreedRateInput && (
                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                  <span className="inline-flex items-center bg-[#1F1F21] text-[#FFD528] text-xs font-bold px-2.5 py-1 rounded-full font-mono">
                    {activeEngine.meta.currencySymbol}{agreedRate}/day
                  </span>
                  {!selectedRole.isBuyout && activeEngine.meta.features.bhrOtInfo && (
                    <span className="text-xs text-muted-foreground">
                      BHR {activeEngine.meta.currencySymbol}{(selectedRole.engineData.customBhr as number | undefined) ?? Math.round(parseInt(agreedRate) / 10)}/hr
                      {(selectedRole.engineData.otGrade as string) !== 'N/A' && (
                        <> · OT Grade {selectedRole.engineData.otGrade as string} · OT {activeEngine.meta.currencySymbol}{Math.round(((selectedRole.engineData.customBhr as number | undefined) ?? Math.round(parseInt(agreedRate) / 10)) * (selectedRole.engineData.otCoefficient as number))}/hr</>
                      )}
                    </span>
                  )}
                </div>
              )}
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
              </div>

              <div className="space-y-2">
                <Label>Day Type</Label>
                <Select value={dayType} onValueChange={handleDayTypeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeEngine.dayTypes.map(dt => (
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
                const callMins = parseInt(callTime.split(':')[0]) * 60 + parseInt(callTime.split(':')[1]);
                // Use effectiveWrapTime (hours > 24 when next-day) so duration is always correct
                let wrapMins = parseInt(effectiveWrapTime.split(':')[0]) * 60 + parseInt(effectiveWrapTime.split(':')[1]);
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
                    showNextDay
                    isNextDay={wrapNextDay}
                    onNextDayChange={(v) => { wrapManualRef.current = true; setWrapNextDay(v); }}
                  />
                </div>
              );
            })()}

            <Separator />

            {/* Breaks */}
            {activeEngine.meta.features.breaksAndPenalties && (dayType === 'basic_working' || dayType === 'continuous_working' || dayType === 'prep' || dayType === 'recce' || dayType === 'build_strike' || dayType === 'pre_light') && (
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
                              <TimePicker
                                value={firstBreakTime}
                                onChange={setFirstBreakTime}
                                triggerClassName="h-9 w-[110px] rounded-xl"
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
                              <TimePicker
                                value={secondBreakTime}
                                onChange={setSecondBreakTime}
                                triggerClassName="h-9 w-[110px] rounded-xl"
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

                  {dayType === 'continuous_working' && activeEngine.meta.features.breaksAndPenalties && (
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

            {/* Travel (& Mileage) — collapsible */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowTravel(v => !v)}
                className="flex items-center gap-2 text-sm font-medium w-full text-left group"
              >
                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showTravel ? 'rotate-90' : ''}`} />
                <Car className="h-3.5 w-3.5" /> {activeEngine.meta.features.mileage ? 'Travel & Mileage' : 'Travel'}
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
                  {activeEngine.meta.features.mileage && (
                    <div className="space-y-2">
                      <Label htmlFor="mileage" className="text-sm">Miles outside M25</Label>
                      <Input id="mileage" type="number" value={mileage} onChange={e => setMileage(e.target.value)} onWheel={e => e.currentTarget.blur()} min="0" placeholder="0" className="rounded-xl" />
                      <p className="text-xs text-muted-foreground">50p/mile · W1F 9SE to location & back</p>
                    </div>
                  )}
                  {activeEngine.meta.features.equipmentTransport && (
                    <>
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium">Transporting equipment?</label>
                        <Switch
                          checked={hasEquipment}
                          onCheckedChange={(v) => {
                            setHasEquipment(v);
                            setKmRate(v ? 0.80 : 0.43);
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium">
                          Distance ({activeEngine.meta.mileageUnit})
                        </label>
                        <Input
                          type="number"
                          value={mileage}
                          onChange={(e) => setMileage(e.target.value)}
                          onWheel={e => e.currentTarget.blur()}
                          min={0}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium">Rate per km ({activeEngine.meta.currencySymbol})</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={kmRate}
                          onChange={(e) => setKmRate(Number(e.target.value))}
                          onWheel={e => e.currentTarget.blur()}
                          min={0}
                          className="rounded-xl"
                        />
                      </div>
                    </>
                  )}
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
                    <span className="text-xs text-muted-foreground font-normal ml-1">{activeEngine.meta.currencySymbol}{equipmentValue}</span>
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
                                <span className="font-mono text-xs text-muted-foreground shrink-0">{activeEngine.meta.currencySymbol}{pkg.day_rate}/day</span>
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
                  <Label htmlFor="equipment-value" className="text-sm">Value ({activeEngine.meta.currencySymbol})</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{activeEngine.meta.currencySymbol}</span>
                    <Input
                      id="equipment-value"
                      type="number"
                      value={equipmentValue}
                      onChange={e => setEquipmentValue(e.target.value)}
                      onWheel={e => e.currentTarget.blur()}
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
                      onWheel={e => e.currentTarget.blur()}
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
                        {activeEngine.meta.currencySymbol}{(parseFloat(equipmentValue) * (1 - parseFloat(equipmentDiscount) / 100)).toFixed(2)}
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
                  <span className="text-xs text-muted-foreground font-normal ml-1">{activeEngine.meta.currencySymbol}{expensesDayAmount}</span>
                )}
              </button>
              {showExpensesSection && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-5">
                <div className="space-y-2">
                  <Label htmlFor="expenses-amount">Amount ({activeEngine.meta.currencySymbol})</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{activeEngine.meta.currencySymbol}</span>
                    <Input
                      id="expenses-amount"
                      type="number"
                      className="pl-7"
                      value={expensesDayAmount}
                      onChange={e => setExpensesDayAmount(e.target.value)}
                      onWheel={e => e.currentTarget.blur()}
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

            {/* Time Off The Clock — auto-calculated from project days (APA UK only) */}
            {activeEngine.meta.features.tocWarning && autoPreviousWrap && callTime && (() => {
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
              {/* Save status indicator */}
              {result && (
                <div className="flex items-center gap-1.5 text-sm ml-auto">
                  {saving ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Cloud className="h-3.5 w-3.5 animate-pulse" /> Saving…
                    </span>
                  ) : saveError ? (
                    <Button size="sm" onClick={handleSave} disabled={saving} variant="destructive">
                      <Save className="h-3.5 w-3.5 mr-1" /> Save failed — retry
                    </Button>
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

            {/* Add New Day — bottom of form */}
            {projectId && currentDayId && (
              <div className="pt-2">
                <Button
                  className="w-full bg-[#FFD528] text-[#1F1F21] hover:bg-[#FFD528]/90 font-semibold gap-1.5"
                  onClick={handleAddDay}
                  disabled={saving}
                >
                  <Plus className="h-4 w-4" /> Add New Day
                </Button>
              </div>
            )}

            {/* Mobile sticky save bar */}
            {result && (
              <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-safe">
                <div className={`mx-auto max-w-lg mb-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-lg text-sm font-medium transition-colors ${
                  saving ? 'bg-muted text-muted-foreground' :
                  saveError ? 'bg-red-50 text-red-700 border border-red-200' :
                  lastSavedAt ? 'bg-green-50 text-green-700 border border-green-200' :
                  'bg-[#1F1F21] text-white'
                }`}>
                  {saving ? (
                    <><Cloud className="h-4 w-4 animate-pulse" /><span>Saving…</span></>
                  ) : saveError ? (
                    <><Save className="h-4 w-4" /><span>Save failed — tap to retry</span></>
                  ) : lastSavedAt ? (
                    <><Check className="h-4 w-4" /><span>Saved</span></>
                  ) : (
                    <><Save className="h-4 w-4" /><span>Not saved yet — tap to save</span></>
                  )}
                  {!saving && (saveError || !lastSavedAt) && (
                    <button onClick={handleSave} className={`rounded-xl px-3 py-1 text-xs font-semibold ${saveError ? 'bg-red-600 text-white' : 'bg-[#FFD528] text-[#1F1F21]'}`}>
                      {saveError ? 'Retry' : 'Save'}
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
              currency={activeEngine.meta.currencySymbol}
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
                day_type?: string;
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
                  day_type: d.day_type,
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
                  day_type: dayType,
                  isCurrent: true,
                  expensesAmount: parseFloat(expensesDayAmount) || 0,
                  expensesNotes: expensesDayNotes,
                  rj: {
                    lineItems: result.lineItems,
                    penalties: result.penalties,
                    subtotal: result.subtotal,
                    travelPay: result.travelPay,
                    mileage: result.mileage,
                    mileageMiles: result.mileageDistance,
                    equipmentValue: result.equipmentValue,
                    equipmentDiscount: result.equipmentDiscount,
                    equipmentTotal: result.equipmentTotal,
                    dayDescription: result.dayDescription,
                  },
                },
              ].sort((a, b) => a.work_date.localeCompare(b.work_date));
              // Day number = chronological position (1-based)

              const projectTotal = allDays.reduce((s, d) => s + (d.grand_total || 0), 0);
              const isMultiDay = allDays.length > 1;

              return (
                <div className="space-y-2">
                  {allDays.map((day, idx) => {
                    const rj = day.rj;
                    const hasDetail = rj && (
                      (rj.lineItems?.length ?? 0) > 0 ||
                      (rj.penalties?.length ?? 0) > 0 ||
                      (rj.travelPay ?? 0) > 0 ||
                      (rj.mileage ?? 0) > 0
                    );

                    // Day type label: prefer stored dayDescription, fall back to day_type map
                    // Normalise legacy "Converted to Continuous…" text to the canonical label
                    const rawDayLabel = rj?.dayDescription
                      ?? (day.day_type ? DAY_TYPE_SHORT[day.day_type] : undefined)
                      ?? '—';
                    const dayLabel = rawDayLabel.replace(
                      /^Converted to Continuous[^-]*/i,
                      'Continuous Working Day ',
                    );

                    return (
                      <div
                        key={day.key}
                        className={cn(
                          'rounded-2xl border overflow-hidden transition-all',
                          day.isCurrent
                            ? 'border-[#FFD528] shadow-[0_0_0_1px_#FFD528]'
                            : 'border-border cursor-pointer hover:border-muted-foreground/30',
                        )}
                        onClick={() => { if (!day.isCurrent) loadDayById(day.key); }}
                      >
                        {/* Day header */}
                        <div className={cn('px-3 pt-3 pb-2.5', day.isCurrent ? 'bg-[#FFD528]/6' : '')}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="text-xs font-black uppercase tracking-widest text-foreground">Day {idx + 1}</span>
                                <span className="text-xs text-muted-foreground">
                                  {day.work_date ? format(parseISO(day.work_date), 'EEE d MMM yyyy') : '—'}
                                </span>
                              </div>
                              <p className="text-[11px] font-bold uppercase tracking-wide text-[#FFD528] mt-0.5 leading-tight">
                                {dayLabel}
                              </p>
                              {day.isCurrent && activeEngine.meta.features.callTypeBadges && (result.extra?.callType as string | undefined) && (result.extra?.callType as string) !== 'standard' && (
                                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${
                                  (result.extra?.callType as string) === 'early' ? 'bg-yellow-100 text-yellow-800' :
                                  (result.extra?.callType as string) === 'late' ? 'bg-orange-100 text-orange-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {String(result.extra?.callType).charAt(0).toUpperCase() + String(result.extra?.callType).slice(1)} Call
                                </span>
                              )}
                              <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{day.role_name}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="font-mono text-sm font-bold tabular-nums">{activeEngine.meta.currencySymbol}{(day.grand_total || 0).toFixed(2)}</span>
                              {!day.isCurrent && (
                                <button
                                  onClick={e => { e.stopPropagation(); removeDay(day.key); }}
                                  className="p-1 rounded-lg text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Remove day"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Line items — always visible for current day */}
                        {day.isCurrent && hasDetail && rj && (
                          <div className="border-t border-[#FFD528]/25 bg-background px-3 pt-2 pb-3">
                            <div className="grid gap-x-3 items-center" style={{ gridTemplateColumns: '1fr auto' }}>
                              {rj.lineItems?.filter(Boolean).map((item, i) => {
                                const isFlatRate = !!(item.rate && Math.abs(item.total - item.rate) < 1);
                                const isDayRate = item.isDayRate || isFlatRate;
                                const timePart = item.timeFrom && item.timeTo ? `${item.timeFrom}–${item.timeTo}` : '';
                                let ratePart = '';
                                if (item.rate && item.hours) {
                                  ratePart = isDayRate
                                    ? `${activeEngine.meta.currencySymbol}${item.total} × 1`
                                    : `${activeEngine.meta.currencySymbol}${item.rate} × ${parseFloat(item.hours.toFixed(2))}`;
                                }
                                const detail = [timePart, ratePart].filter(Boolean).join(' · ');
                                return (
                                  <Fragment key={i}>
                                    <div className="py-[3px]">
                                      <p className="text-xs text-muted-foreground leading-tight">{item.description}</p>
                                      {detail && <span className="text-[10px] text-muted-foreground/50 font-mono">{detail}</span>}
                                    </div>
                                    <span className="font-mono text-xs font-semibold tabular-nums text-right py-[3px]">{activeEngine.meta.currencySymbol}{(item.total ?? 0).toFixed(2)}</span>
                                  </Fragment>
                                );
                              })}

                              {(rj.penalties?.length ?? 0) > 0 && (
                                <>
                                  <div className="col-span-2 border-t border-border/40 my-1" />
                                  {rj.penalties!.filter(Boolean).map((p, i) => {
                                    const pIsFlatRate = !!(p.rate && Math.abs(p.total - p.rate) < 1);
                                    let pDetail = '';
                                    if (p.rate && p.hours) {
                                      pDetail = pIsFlatRate
                                        ? `${activeEngine.meta.currencySymbol}${p.rate} × 1`
                                        : `${activeEngine.meta.currencySymbol}${p.rate} × ${parseFloat(p.hours.toFixed(2))}`;
                                    }
                                    return (
                                      <Fragment key={`p-${i}`}>
                                        <div className="py-[3px]">
                                          <p className="text-xs text-muted-foreground leading-tight">{p.description}</p>
                                          {pDetail && <span className="text-[10px] text-muted-foreground/50 font-mono">{pDetail}</span>}
                                        </div>
                                        <span className="font-mono text-xs font-semibold tabular-nums text-right py-[3px]">{activeEngine.meta.currencySymbol}{(p.total ?? 0).toFixed(2)}</span>
                                      </Fragment>
                                    );
                                  })}
                                </>
                              )}

                              {(rj.travelPay ?? 0) > 0 && (
                                <Fragment key="travel">
                                  <p className="text-xs text-muted-foreground py-[3px]">Travel</p>
                                  <span className="font-mono text-xs font-semibold tabular-nums text-right py-[3px]">{activeEngine.meta.currencySymbol}{(rj.travelPay ?? 0).toFixed(2)}</span>
                                </Fragment>
                              )}

                              {(rj.mileage ?? 0) > 0 && (
                                <Fragment key="mileage">
                                  <p className="text-xs text-muted-foreground py-[3px]">Mileage ({rj.mileageMiles} {activeEngine.meta.mileageUnit})</p>
                                  <span className="font-mono text-xs font-semibold tabular-nums text-right py-[3px]">{activeEngine.meta.currencySymbol}{(rj.mileage ?? 0).toFixed(2)}</span>
                                </Fragment>
                              )}

                              {(rj.equipmentTotal ?? 0) > 0 && (
                                <Fragment key="equip">
                                  <p className="text-xs text-muted-foreground py-[3px]">Equipment{(rj.equipmentDiscount ?? 0) > 0 ? ` (−${rj.equipmentDiscount}%)` : ''}</p>
                                  <span className="font-mono text-xs font-semibold tabular-nums text-right py-[3px]">{activeEngine.meta.currencySymbol}{(rj.equipmentTotal ?? 0).toFixed(2)}</span>
                                </Fragment>
                              )}

                              {(day.expensesAmount ?? 0) > 0 && (
                                <Fragment key="expenses">
                                  <p className="text-xs text-muted-foreground py-[3px]">Expenses</p>
                                  <span className="font-mono text-xs font-semibold tabular-nums text-right py-[3px]">{activeEngine.meta.currencySymbol}{(day.expensesAmount ?? 0).toFixed(2)}</span>
                                </Fragment>
                              )}
                            </div>

                            <div className="border-t border-border/40 mt-1 pt-1.5 flex items-center justify-between">
                              <span className="text-xs font-black uppercase tracking-wide">Day Total</span>
                              <span className="font-mono text-sm font-black tabular-nums">{activeEngine.meta.currencySymbol}{(day.grand_total || 0).toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Project / job total */}
                  <div className="flex justify-between text-sm font-bold px-1 pt-1">
                    <span>{isMultiDay ? 'Job Total' : 'Total'}</span>
                    <span className="font-mono">{activeEngine.meta.currencySymbol}{projectTotal.toFixed(2)}</span>
                  </div>

                  {currentDayId && (
                    <>
                      <Button
                        variant="outline"
                        className="w-full mt-1"
                        disabled={isDirty}
                        onClick={() => navigate('/invoices', { state: { dayId: currentDayId } })}
                      >
                        <InvoiceIcon className="h-4 w-4 mr-2" /> Convert to Timesheet
                      </Button>
                      {isDirty && (
                        <p className="text-xs text-center text-muted-foreground mt-1">Unsaved changes, please save first</p>
                      )}
                    </>
                  )}

                  <p className="text-center mt-3">
                    <button
                      onClick={() => { setReportOpen(true); setReportSent(false); setReportError(null); setReportShareData(false); setReportAgreeTerms(false); setReportMessage(''); }}
                      className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2 transition-colors"
                    >
                      Report a miscalculation
                    </button>
                  </p>
                </div>
              );
            })()}
          </CardContent>
        </Card>

      </div>
    </div>

    <Dialog open={reportOpen} onOpenChange={setReportOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a Miscalculation</DialogTitle>
          <DialogDescription>
            Describe what you think is incorrect and we'll look into it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <Textarea
            value={reportMessage}
            onChange={e => setReportMessage(e.target.value)}
            placeholder="e.g. The overtime rate on a Sunday prep day seems too low..."
            rows={4}
          />

          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={reportShareData}
                onCheckedChange={v => setReportShareData(v === true)}
                className="mt-0.5 shrink-0"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wide mr-1">Optional</span>
                I consent to sharing my calculation data (role, rate, times, and result) with Crew Dock to help investigate this report. This data will only be used to resolve the issue and will not be sold or passed to third parties beyond our service providers.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={reportAgreeTerms}
                onCheckedChange={v => setReportAgreeTerms(v === true)}
                className="mt-0.5 shrink-0"
              />
              <span className="text-xs text-muted-foreground leading-relaxed">
                I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Terms & Conditions</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Privacy Policy</a>.
              </span>
            </label>
          </div>

          {reportError && <p className="text-sm text-destructive">{reportError}</p>}
          {reportSent
            ? <p className="text-sm text-green-600">Thanks — we'll look into it!</p>
            : (
              <Button onClick={handleSendReport} disabled={reportSending || !reportAgreeTerms} className="w-full">
                <Send className="h-4 w-4 mr-2" />
                {reportSending ? 'Sending...' : 'Send Report'}
              </Button>
            )
          }
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
