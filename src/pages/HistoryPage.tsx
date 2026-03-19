import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { History, Trash2, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface SavedCalculation {
  id: string;
  created_at: string;
  project_name: string;
  role_name: string;
  department: string;
  agreed_rate: number;
  day_type: string;
  day_of_week: string;
  call_time: string;
  wrap_time: string;
  grand_total: number;
  result_json: Record<string, unknown>;
}

export function HistoryPage() {
  const { user } = useAuth();
  const [calculations, setCalculations] = useState<SavedCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadCalculations();
  }, [user]);

  const loadCalculations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('calculations')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setCalculations(data as SavedCalculation[]);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('calculations').delete().eq('id', id);
    setCalculations(prev => prev.filter(c => c.id !== id));
  };

  const totalSpend = calculations.reduce((sum, c) => sum + c.grand_total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6" />
          Calculation History
        </h1>
        {calculations.length > 0 && (
          <Badge variant="outline" className="text-base px-4 py-1">
            Total: £{totalSpend.toFixed(2)}
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : calculations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No saved calculations yet. Use the calculator to create and save your first one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {calculations.map(calc => (
            <Card key={calc.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{calc.project_name}</span>
                      <Badge variant="secondary">{calc.role_name}</Badge>
                      <Badge variant="outline">{calc.day_type.replace(/_/g, ' ')}</Badge>
                      <Badge variant="outline">{calc.day_of_week}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(calc.created_at), 'dd MMM yyyy HH:mm')} | Call: {calc.call_time} - Wrap: {calc.wrap_time} | Rate: £{calc.agreed_rate}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono text-primary">
                      £{calc.grand_total.toFixed(2)}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => setExpandedId(expandedId === calc.id ? null : calc.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(calc.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {expandedId === calc.id && calc.result_json && (
                  <div className="mt-4 p-4 bg-muted rounded-md">
                    <pre className="text-xs overflow-auto">{JSON.stringify(calc.result_json, null, 2)}</pre>
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
