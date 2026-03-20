import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Save, RotateCcw, PoundSterling, CalendarDays } from 'lucide-react';
import { format, getDay } from 'date-fns';
import { APA_CREW_ROLES, DEPARTMENTS, getRolesByDepartment, type CrewRole } from '@/data/apa-rates';
import { calculateCrewCost, type DayType, type DayOfWeek, type CalculationResult } from '@/data/calculation-engine';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

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

export function CalculatorPage() {
  const { user } = useAuth();
  const [selectedRole, setSelectedRole] = useState<CrewRole | null>(null);
  const [agreedRate, setAgreedRate] = useState<string>('');
  const [dayType, setDayType] = useState<DayType>('basic_working');
  const [workDate, setWorkDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [isBankHoliday, setIsBankHoliday] = useState(false);
  const [callTime, setCallTime] = useState('08:00');
  const [wrapTime, setWrapTime] = useState('19:00');
  const [firstBreakGiven, setFirstBreakGiven] = useState(true);
  const [firstBreakTime, setFirstBreakTime] = useState('13:00');
  const [firstBreakDuration, setFirstBreakDuration] = useState('60');
  const [secondBreakGiven, setSecondBreakGiven] = useState(true);
  const [secondBreakTime, setSecondBreakTime] = useState('18:30');
  const [secondBreakDuration, setSecondBreakDuration] = useState('30');
  const [continuousFirstBreakGiven, setContinuousFirstBreakGiven] = useState(true);
  const [continuousAdditionalBreakGiven, setContinuousAdditionalBreakGiven] = useState(true);
  const [travelHours, setTravelHours] = useState('0');
  const [mileage, setMileage] = useState('0');
  const [previousWrap, setPreviousWrap] = useState('');
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const dayOfWeek: DayOfWeek = useMemo(() => {
    if (isBankHoliday) return 'bank_holiday';
    return dateToDayOfWeek(workDate);
  }, [workDate, isBankHoliday]);

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
      previousWrapTime: previousWrap || undefined,
    });
  }, [selectedRole, agreedRate, dayType, dayOfWeek, callTime, wrapTime, firstBreakGiven, firstBreakTime, firstBreakDuration, secondBreakGiven, secondBreakTime, secondBreakDuration, continuousFirstBreakGiven, continuousAdditionalBreakGiven, travelHours, mileage, previousWrap, workDate, isBankHoliday]);

  const handleRoleChange = (roleName: string) => {
    const role = APA_CREW_ROLES.find(r => r.role === roleName);
    setSelectedRole(role || null);
    if (role?.maxRate) {
      setAgreedRate(role.maxRate.toString());
    }
  };

  const handleReset = () => {
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
    setProjectName('');
  };

  const handleSave = async () => {
    if (!result || !user || !selectedRole) return;
    setSaving(true);
    setSaveSuccess(false);

    const { error } = await supabase.from('calculations').insert({
      user_id: user.id,
      project_name: projectName || 'Untitled',
      role_name: selectedRole.role,
      department: selectedRole.department,
      agreed_rate: parseInt(agreedRate),
      day_type: dayType,
      day_of_week: dayOfWeek,
      call_time: callTime,
      wrap_time: wrapTime,
      result_json: result,
      grand_total: result.grandTotal,
    });

    setSaving(false);
    if (!error) setSaveSuccess(true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Input Form */}
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PoundSterling className="h-5 w-5" />
              Crew Rate Calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Project Name */}
            <div className="space-y-2">
              <Label htmlFor="project">Project Name</Label>
              <Input id="project" placeholder="e.g. Nike Summer Campaign" value={projectName} onChange={e => setProjectName(e.target.value)} />
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
                    {DEPARTMENTS.map(dept => (
                      <SelectGroup key={dept}>
                        <SelectLabel>{dept}</SelectLabel>
                        {getRolesByDepartment(dept).map(role => (
                          <SelectItem key={role.role} value={role.role}>
                            {role.role}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
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
                    APA range: £{selectedRole.minRate || 'N/A'} – £{selectedRole.maxRate || 'N/A'}
                    {selectedRole.otGrade !== 'N/A' && ` | OT Grade ${selectedRole.otGrade} (x${selectedRole.otCoefficient})`}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Day Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Day Type</Label>
                <Select value={dayType} onValueChange={v => setDayType(v as DayType)}>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="call">Call Time</Label>
                <Input id="call" type="time" value={callTime} onChange={e => setCallTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wrap">Wrap Time</Label>
                <Input id="wrap" type="time" value={wrapTime} onChange={e => setWrapTime(e.target.value)} />
              </div>
            </div>

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
                              <Label htmlFor="break1time">Break started at</Label>
                              <Input id="break1time" type="time" value={firstBreakTime} onChange={e => setFirstBreakTime(e.target.value)} />
                              <p className="text-xs text-muted-foreground">Must start within 5½ hrs of call. Delayed after 5½ hrs = £10 penalty. After 6½ hrs = missed.</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="break1dur">Actual duration (mins)</Label>
                              <Input id="break1dur" type="number" className="w-24" value={firstBreakDuration} onChange={e => setFirstBreakDuration(e.target.value)} min="0" max="60" />
                              <p className="text-xs text-muted-foreground">Standard: 60 mins. Shorter = curtailed penalty.</p>
                            </div>
                          </div>
                        )}
                        {!firstBreakGiven && (
                          <p className="ml-7 text-xs text-orange-600">Day treated as Continuous Working Day + £7.50 meal allowance</p>
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
                              <Label htmlFor="break2time">Break started at</Label>
                              <Input id="break2time" type="time" value={secondBreakTime} onChange={e => setSecondBreakTime(e.target.value)} />
                              <p className="text-xs text-muted-foreground">Must start within 5½ hrs after first break ended. Can't be delayed — late = missed.</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="break2dur">Actual duration (mins)</Label>
                              <Input id="break2dur" type="number" className="w-24" value={secondBreakDuration} onChange={e => setSecondBreakDuration(e.target.value)} min="0" max="30" />
                              <p className="text-xs text-muted-foreground">Standard: 30 mins. Shorter = curtailed penalty.</p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="travel">Travel Time (hours, at BHR)</Label>
                <Input id="travel" type="number" step="0.5" value={travelHours} onChange={e => setTravelHours(e.target.value)} min="0" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mileage">Mileage outside M25 (miles)</Label>
                <Input id="mileage" type="number" value={mileage} onChange={e => setMileage(e.target.value)} min="0" />
                <p className="text-xs text-muted-foreground">50p per mile</p>
              </div>
            </div>

            {/* Time Off The Clock */}
            <div className="space-y-2">
              <Label htmlFor="prevWrap">Previous Day Wrap Time (for TOC calculation)</Label>
              <Input id="prevWrap" type="time" value={previousWrap} onChange={e => setPreviousWrap(e.target.value)} />
              <p className="text-xs text-muted-foreground">Leave empty if not applicable. Min 11 hours between wrap and next call.</p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reset
              </Button>
              {result && (
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Calculation'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Panel */}
      <div className="space-y-6">
        <Card className="sticky top-20">
          <CardHeader>
            <CardTitle>Cost Breakdown</CardTitle>
            {result && <Badge variant="secondary">{result.dayDescription}</Badge>}
          </CardHeader>
          <CardContent>
            {!result ? (
              <p className="text-muted-foreground text-sm">Select a role and enter rate details to see the cost breakdown.</p>
            ) : (
              <div className="space-y-4">
                {/* Line Items */}
                <div className="space-y-2">
                  {result.lineItems.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{item.description}</span>
                      <span className="font-mono">£{item.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {result.lineItems.length > 0 && <Separator />}

                <div className="flex justify-between text-sm font-medium">
                  <span>Subtotal</span>
                  <span className="font-mono">£{result.subtotal.toFixed(2)}</span>
                </div>

                {/* Penalties */}
                {result.penalties.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-orange-600">Penalties</p>
                      {result.penalties.map((p, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{p.description}</span>
                          <span className="font-mono">£{p.total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Travel */}
                {result.travelPay > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Travel</span>
                    <span className="font-mono">£{result.travelPay.toFixed(2)}</span>
                  </div>
                )}

                {result.mileage > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Mileage ({result.mileageMiles} miles @ 50p)</span>
                    <span className="font-mono">£{result.mileage.toFixed(2)}</span>
                  </div>
                )}

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="font-mono text-primary">£{result.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
