import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { History, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getEngine, DEFAULT_ENGINE_ID } from '@/engines/index';

interface ProjectDay {
  id: string;
  created_at: string;
  work_date: string;
  role_name: string;
  department: string;
  agreed_rate: number;
  day_type: string;
  day_of_week: string;
  call_time: string;
  wrap_time: string;
  grand_total: number;
  result_json: {
    lineItems?: { description: string; total: number }[];
    penalties?: { description: string; total: number }[];
    travelPay?: number;
    mileage?: number;
    mileageMiles?: number;
  };
  projects: { name: string; client_name: string | null; calc_engine: string | null } | null;
}

function getCurrencySymbol(calcEngine: string | null | undefined): string {
  try {
    return getEngine(calcEngine ?? DEFAULT_ENGINE_ID).meta.currencySymbol;
  } catch {
    return '£';
  }
}

function groupByCurrency(rows: Array<{ calc_engine?: string | null; total: number }>) {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const symbol = getCurrencySymbol(row.calc_engine);
    totals[symbol] = (totals[symbol] ?? 0) + row.total;
  }
  return totals;
}

function formatMultiCurrencyTotal(totals: Record<string, number>): string {
  return Object.entries(totals)
    .map(([symbol, total]) => `${symbol}${total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' · ');
}

export function HistoryPage() {
  const { user } = useAuth();
  const [days, setDays] = useState<ProjectDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadDays();
  }, [user]);

  const loadDays = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('project_days')
      .select('*, projects(name, client_name, calc_engine)')
      .order('work_date', { ascending: false });
    if (data) setDays(data as ProjectDay[]);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('project_days').delete().eq('id', id);
    setDays(prev => prev.filter(d => d.id !== id));
  };

  const totalSpend = days.reduce((sum, d) => sum + (d.grand_total || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6" />
          Calculation History
        </h1>
        {days.length > 0 && (
          <Badge variant="outline" className="text-base px-4 py-1">
            Total: {formatMultiCurrencyTotal(groupByCurrency(days.map(d => ({ calc_engine: d.projects?.calc_engine, total: d.grand_total || 0 }))))}
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : days.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No saved calculations yet. Use the calculator to create and save your first one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {days.map(day => (
            <Card key={day.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{day.projects?.name ?? 'Untitled'}</span>
                      {day.projects?.client_name && (
                        <span className="text-sm text-muted-foreground">— {day.projects.client_name}</span>
                      )}
                      <Badge variant="secondary">{day.role_name}</Badge>
                      <Badge variant="outline">{day.day_type.replace(/_/g, ' ')}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {day.work_date ? format(parseISO(day.work_date), 'dd MMM yyyy') : '—'} | Call: {day.call_time} – Wrap: {day.wrap_time} | Rate: {getCurrencySymbol(day.projects?.calc_engine)}{day.agreed_rate}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono text-foreground">
                      {getCurrencySymbol(day.projects?.calc_engine)}{(day.grand_total || 0).toFixed(2)}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => setExpandedId(expandedId === day.id ? null : day.id)}>
                      {expandedId === day.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(day.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {expandedId === day.id && day.result_json && (
                  <div className="mt-4 p-4 bg-muted/40 rounded-xl space-y-1 text-sm">
                    {day.result_json.lineItems?.map((item, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-muted-foreground">{item.description}</span>
                        <span className="font-mono">{getCurrencySymbol(day.projects?.calc_engine)}{item.total.toFixed(2)}</span>
                      </div>
                    ))}
                    {day.result_json.penalties?.map((p, i) => (
                      <div key={i} className="flex justify-between text-orange-600">
                        <span>{p.description}</span>
                        <span className="font-mono">{getCurrencySymbol(day.projects?.calc_engine)}{p.total.toFixed(2)}</span>
                      </div>
                    ))}
                    {(day.result_json.travelPay ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Travel</span>
                        <span className="font-mono">{getCurrencySymbol(day.projects?.calc_engine)}{(day.result_json.travelPay ?? 0).toFixed(2)}</span>
                      </div>
                    )}
                    {(day.result_json.mileage ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mileage ({day.result_json.mileageMiles} miles @ 50p)</span>
                        <span className="font-mono">{getCurrencySymbol(day.projects?.calc_engine)}{(day.result_json.mileage ?? 0).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold pt-2 border-t border-border">
                      <span>Total</span>
                      <span className="font-mono text-foreground">{getCurrencySymbol(day.projects?.calc_engine)}{(day.grand_total || 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Data is retained for 1 year from creation date, in compliance with our data retention policy.
      </p>
    </div>
  );
}
