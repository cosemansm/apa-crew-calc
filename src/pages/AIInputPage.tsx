import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { APA_CREW_ROLES } from '@/data/apa-rates';
import { calculateCrewCost, type DayType, type DayOfWeek, type CalculationResult } from '@/data/calculation-engine';

interface ParsedEntry {
  role: string;
  agreedRate: number;
  dayType: DayType;
  dayOfWeek: DayOfWeek;
  callTime: string;
  wrapTime: string;
  notes: string;
}

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
      const response = await fetch('/api/parse-timesheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          availableRoles: APA_CREW_ROLES.map(r => r.role),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to parse input. Please try again.');
      }

      const data = await response.json();
      const entries: ParsedEntry[] = data.entries;
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
          firstBreakDurationMins: 60,
          secondBreakGiven: true,
          secondBreakDurationMins: 30,
          continuousFirstBreakGiven: true,
          continuousAdditionalBreakGiven: true,
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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Timesheet Input
          </CardTitle>
          <CardDescription>
            Describe your shoot days in plain English and we'll calculate the costs for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder={`Example:\n"I worked as a Gaffer on Monday, called at 6am and wrapped at 9pm. Missed my second break. Then on Tuesday I was called at 8am, wrapped at 7pm, standard day."\n\nOr:\n"3 day shoot - DoP at £1200/day\nDay 1 (Wed): Call 0800, Wrap 2100\nDay 2 (Thu): Call 0700, Wrap 2200, continuous day\nDay 3 (Fri): Call 0900, Wrap 1900"`}
            className="min-h-[200px]"
            value={input}
            onChange={e => setInput(e.target.value)}
          />

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={loading || !input.trim()}>
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing...</>
              ) : (
                <><Send className="h-4 w-4 mr-1" /> Calculate</>
              )}
            </Button>
            <Button variant="outline" onClick={() => navigate('/calculator')}>
              Manual Calculator
            </Button>
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-md text-sm">
              {error}
              <p className="mt-2 text-xs">
                Note: The AI parsing requires the API endpoint to be configured. You can use the manual calculator in the meantime.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parsed Results */}
      {parsed && results && (
        <Card>
          <CardHeader>
            <CardTitle>Parsed Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {parsed.map((entry, i) => (
              <div key={i} className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge>{entry.role}</Badge>
                  <Badge variant="outline">{entry.dayOfWeek}</Badge>
                  <Badge variant="secondary">{entry.dayType.replace(/_/g, ' ')}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Call: {entry.callTime} | Wrap: {entry.wrapTime} | Rate: £{entry.agreedRate}
                </div>
                {results[i] && (
                  <div className="text-lg font-bold font-mono text-primary">
                    £{results[i].grandTotal.toFixed(2)}
                  </div>
                )}
                {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
              </div>
            ))}

            <Separator />

            <div className="flex justify-between text-xl font-bold">
              <span>Total Cost</span>
              <span className="font-mono text-primary">£{totalCost.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Example prompts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Example Prompts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            'I was a Focus Puller on Monday at £558. Called at 7am, wrapped at 10pm.',
            '2 day shoot as Gaffer at £568. Monday 0800-2100, Tuesday 0700-1900 continuous day.',
            'Saturday night shoot as Sound Mixer at £649. Called at 6pm, wrapped at 5am.',
            'Prep day on Wednesday as Art Director at £852. 10am to 6pm.',
          ].map((example, i) => (
            <button
              key={i}
              className="w-full text-left p-3 rounded-md border text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
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
