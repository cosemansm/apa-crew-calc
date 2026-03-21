import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { APA_CREW_ROLES } from '@/data/apa-rates';
import { calculateCrewCost, type CalculationResult } from '@/data/calculation-engine';
import { parseTimesheetWithGemini, type ParsedEntry } from '@/lib/gemini';

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

export function AIInputPage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<ParsedEntry[] | null>(null);
  const [results, setResults] = useState<CalculationResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    setParsed(null);
    setResults(null);

    try {
      const entries = await parseTimesheetWithGemini(input);
      setParsed(entries);

      // Calculate results for each parsed entry
      const calculationResults = entries.map(entry => {
        const role = APA_CREW_ROLES.find(r => r.role === entry.role);
        if (!role) return null;
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
      }).filter(Boolean) as CalculationResult[];

      setResults(calculationResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const totalCost = results?.reduce((sum, r) => sum + r.grandTotal, 0) ?? 0;

  // Count matched vs unmatched roles
  const unmatchedRoles = parsed?.filter(e => !APA_CREW_ROLES.find(r => r.role === e.role)) ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#1F1F21]" />
            AI Timesheet Input
          </CardTitle>
          <CardDescription>
            Describe your shoot days in plain English and we'll calculate the costs for you using APA rates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder={`Example:\n"I worked as a Gaffer on Monday, called at 6am and wrapped at 9pm. Missed my second break."\n\nOr:\n"3 day shoot - DoP at £1200/day\nDay 1 (Wed): Call 0800, Wrap 2100\nDay 2 (Thu): Call 0700, Wrap 2200, continuous day\nDay 3 (Fri): Call 0900, Wrap 1900"`}
            className="min-h-[200px]"
            value={input}
            onChange={e => setInput(e.target.value)}
          />

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={loading || !input.trim()}>
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Parsing with AI...</>
              ) : (
                <><Send className="h-4 w-4 mr-1" /> Calculate</>
              )}
            </Button>
            <Button variant="outline" onClick={() => navigate('/calculator')}>
              Manual Calculator
            </Button>
          </div>

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p>{error}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parsed Results */}
      {parsed && results && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Parsed Results</CardTitle>
              <Badge variant="secondary">{parsed.length} day{parsed.length !== 1 ? 's' : ''} detected</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {unmatchedRoles.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Some roles couldn't be matched:</p>
                  <p className="text-xs mt-0.5">{unmatchedRoles.map(e => e.role).join(', ')} — open in the manual calculator to fix.</p>
                </div>
              </div>
            )}

            {parsed.map((entry, i) => {
              const matched = APA_CREW_ROLES.find(r => r.role === entry.role);
              return (
                <div key={i} className="rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/40">
                    <div className="flex items-center gap-3">
                      <div className="h-7 w-7 rounded-full bg-[#1F1F21] flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-bold text-white">{i + 1}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{entry.role}</span>
                          {!matched && <Badge variant="destructive" className="text-[10px]">Unmatched</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {DAY_TYPE_LABELS[entry.dayType] || entry.dayType}
                          {' · '}
                          <span className="capitalize">{entry.dayOfWeek.replace('_', ' ')}</span>
                          {' · '}
                          {entry.callTime} – {entry.wrapTime}
                          {' · '}
                          £{entry.agreedRate}/day
                        </p>
                      </div>
                    </div>
                    {results[i] && (
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">
                          £{results[i].grandTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Line items breakdown */}
                  {results[i] && (results[i].lineItems.length > 0 || results[i].penalties.length > 0) && (
                    <div className="px-4 py-2 space-y-1">
                      {results[i].lineItems.map((item, j) => (
                        <div key={j} className="flex justify-between text-xs text-muted-foreground">
                          <span>{item.description}</span>
                          <span className="font-medium text-foreground">£{item.total.toFixed(2)}</span>
                        </div>
                      ))}
                      {results[i].penalties.map((item, j) => (
                        <div key={`pen-${j}`} className="flex justify-between text-xs text-orange-600">
                          <span>{item.description}</span>
                          <span className="font-medium">£{item.total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {entry.notes && (
                    <div className="px-4 py-2 border-t border-border/50">
                      <p className="text-xs text-muted-foreground italic">{entry.notes}</p>
                    </div>
                  )}
                </div>
              );
            })}

            <Separator />

            {/* Total */}
            <div className="flex items-center justify-between rounded-xl bg-[#1F1F21] px-4 py-3">
              <span className="text-sm font-bold text-white">Total</span>
              <span className="text-lg font-bold text-[#FFD528]">
                £{totalCost.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <Button className="w-full gap-2" onClick={() => navigate('/calculator')}>
              <ArrowRight className="h-4 w-4" />
              Open in Calculator for fine-tuning
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Example prompts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Example Prompts</CardTitle>
          <CardDescription>Click any example to try it out</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            'I was a Focus Puller on Monday at £558. Called at 7am, wrapped at 10pm.',
            '2 day shoot as Gaffer at £568. Monday 0800-2100, Tuesday 0700-1900 continuous day.',
            'Saturday night shoot as Sound Mixer at £649. Called at 6pm, wrapped at 5am.',
            'Prep day on Wednesday as Art Director at £852. 10am to 6pm.',
            '5 day shoot as DoP at £1200. Mon-Fri, call 0730, wrap around 2000 each day.',
          ].map((example, i) => (
            <button
              key={i}
              className="w-full text-left p-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/50 hover:border-[#1F1F21]/20 transition-all cursor-pointer"
              onClick={() => setInput(example)}
            >
              "{example}"
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
