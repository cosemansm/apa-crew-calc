import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

function TimePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [h, m] = value.split(':');
  // Snap minute to nearest 15
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

export function CalculatorPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const projectNameFromUrl = searchParams.get('name');

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

  // Load project name from URL params
  useEffect(() => {
    if (projectNameFromUrl && !projectName) {
      setProjectName(decodeURIComponent(projectNameFromUrl));
    }
    if (projectId && !projectNameFromUrl) {
      // Load project name from Supabase
      supabase.from('projects').select('name').eq('id', projectId).single().then(({ data }) => {
        if (data && !projectName) setProjectName(data.name);
      });
    }
  }, [projectId, projectNameFromUrl]);

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

            <div className="grid grid-cols-2 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
              <TimePicker label="Call Time" value={callTime} onChange={setCallTime} />
              <div className="hidden md:flex items-center pb-2 text-muted-foreground text-sm">→</div>
              <TimePicker label="Wrap Time" value={wrapTime} onChange={setWrapTime} />
            </div>
            {callTime && wrapTime && (() => {
              let callMins = parseInt(callTime.split(':')[0]) * 60 + parseInt(callTime.split(':')[1]);
              let wrapMins = parseInt(wrapTime.split(':')[0]) * 60 + parseInt(wrapTime.split(':')[1]);
              if (wrapMins <= callMins) wrapMins += 24 * 60;
              const totalHrs = (wrapMins - callMins) / 60;
              const hrs = Math.floor(totalHrs);
              const mins = Math.round((totalHrs - hrs) * 60);
              return (
                <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Day length:</span>
                  <span className="font-medium">{hrs}h {mins > 0 ? `${mins}m` : ''}</span>
                  <span className="text-muted-foreground">({totalHrs} hours)</span>
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
                <div className="space-y-2">
                  <Label>Total Travel Time</Label>
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
                <div className="space-y-2">
                  <Label htmlFor="mileage">Miles outside M25</Label>
                  <div className="relative">
                    <Input id="mileage" type="number" value={mileage} onChange={e => setMileage(e.target.value)} min="0" placeholder="0" />
                  </div>
                  <p className="text-xs text-muted-foreground">50p per mile — W1F 9SE to location and back</p>
                </div>
              </div>
            </div>

            {/* Time Off The Clock */}
            <div className="space-y-2">
              <h3 className="font-medium">Time Off The Clock</h3>
              <div className="space-y-2">
                <TimePicker label="Previous day's wrap time" value={previousWrap || '00:00'} onChange={setPreviousWrap} />
                <p className="text-xs text-muted-foreground">Leave empty if first day. Penalty applies if gap &lt; 11 hours.</p>
              </div>
              {previousWrap && callTime && (() => {
                let prevMins = parseInt(previousWrap.split(':')[0]) * 60 + parseInt(previousWrap.split(':')[1]);
                let callMins = parseInt(callTime.split(':')[0]) * 60 + parseInt(callTime.split(':')[1]);
                let gap = callMins - prevMins;
                if (gap < 0) gap += 24 * 60;
                const gapHrs = Math.floor(gap / 60);
                const gapMins = gap % 60;
                const isTOC = gap / 60 < 11;
                return (
                  <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isTOC ? 'bg-orange-50 text-orange-700' : 'bg-muted/50'}`}>
                    <span>Rest gap: <strong>{gapHrs}h {gapMins > 0 ? `${gapMins}m` : ''}</strong></span>
                    {isTOC && <span>— TOC penalty applies (1hr at OT rate)</span>}
                  </div>
                );
              })()}
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
