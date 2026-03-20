import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { FileText, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface ProjectDay {
  id: string;
  work_date: string;
  role_name: string;
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
  };
  projects: { name: string; client_name: string | null } | null;
}

export function InvoicePage() {
  const { user } = useAuth();
  const location = useLocation();
  const [days, setDays] = useState<ProjectDay[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${Date.now().toString(36).toUpperCase()}`);
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [bankDetails, setBankDetails] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('project_days')
      .select('*, projects(name, client_name)')
      .order('work_date', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setDays(data as ProjectDay[]);
          // If navigated here with a pre-selected day id
          const preselect = (location.state as { dayId?: string } | null)?.dayId;
          if (preselect) setSelected([preselect]);
        }
      });

    // Load user settings for pre-fill
    supabase.from('user_settings').select('*').eq('user_id', user.id).single().then(({ data }) => {
      if (data) {
        if (data.company_name) setCompanyName(data.company_name);
        if (data.company_address) setCompanyAddress(data.company_address);
        if (data.bank_account_name && data.bank_sort_code && data.bank_account_number) {
          setBankDetails(`${data.bank_account_name} | Sort: ${data.bank_sort_code} | Acc: ${data.bank_account_number}`);
        }
      }
    });
  }, [user]);

  const selectedDays = days.filter(d => selected.includes(d.id));
  const totalAmount = selectedDays.reduce((sum, d) => sum + (d.grand_total || 0), 0);

  const handlePrint = () => window.print();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="h-6 w-6" />
        Invoice Generator
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
            <CardDescription>Fill in your details and select days to include</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Invoice Number</Label>
                <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input value={format(new Date(), 'dd/MM/yyyy')} disabled />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Your Name / Company</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your Company Ltd" />
            </div>
            <div className="space-y-2">
              <Label>Your Address</Label>
              <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="123 Film Street, London" />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Client / Production Company</Label>
              <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Production Co. Ltd" />
            </div>
            <div className="space-y-2">
              <Label>Client Address</Label>
              <Input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="456 Studio Road, London" />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Bank Details</Label>
              <Input value={bankDetails} onChange={e => setBankDetails(e.target.value)} placeholder="Account Name | Sort: 12-34-56 | Acc: 12345678" />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Select Days to Include</Label>
              {days.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved days yet. Save a calculation first.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {days.map(day => (
                    <label key={day.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.includes(day.id)}
                        onChange={e => {
                          if (e.target.checked) setSelected([...selected, day.id]);
                          else setSelected(selected.filter(id => id !== day.id));
                        }}
                        className="rounded"
                      />
                      <div className="flex-1 text-sm">
                        <span className="font-medium">{day.projects?.name ?? 'Untitled'}</span>
                        <span className="text-muted-foreground"> — {day.role_name}</span>
                        {day.work_date && <span className="text-muted-foreground"> ({format(parseISO(day.work_date), 'dd MMM')})</span>}
                      </div>
                      <span className="font-mono text-sm">£{(day.grand_total || 0).toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Preview</CardTitle>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
          </CardHeader>
          <CardContent>
            <div ref={printRef} className="space-y-6 text-sm print:text-xs">
              <div className="flex justify-between">
                <div>
                  <p className="font-bold text-lg">{companyName || 'Your Company'}</p>
                  <p className="text-muted-foreground whitespace-pre-line">{companyAddress}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">INVOICE</p>
                  <p className="text-muted-foreground">#{invoiceNumber}</p>
                  <p className="text-muted-foreground">{format(new Date(), 'dd MMMM yyyy')}</p>
                </div>
              </div>

              <div>
                <p className="font-medium">Bill To:</p>
                <p>{clientName || 'Client Name'}</p>
                <p className="text-muted-foreground">{clientAddress}</p>
              </div>

              <Separator />

              {selectedDays.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Description</th>
                      <th className="text-left py-2">Date</th>
                      <th className="text-right py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDays.map(day => (
                      <tr key={day.id} className="border-b">
                        <td className="py-2">
                          <p className="font-medium">{day.projects?.name ?? 'Untitled'}</p>
                          <p className="text-muted-foreground">
                            {day.role_name} — {day.day_type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-muted-foreground">
                            Call: {day.call_time} – Wrap: {day.wrap_time}
                          </p>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {day.work_date ? format(parseISO(day.work_date), 'dd/MM/yy') : '—'}
                        </td>
                        <td className="py-2 text-right font-mono">£{(day.grand_total || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="py-3 text-right font-bold">Total Due:</td>
                      <td className="py-3 text-right font-bold font-mono text-lg">£{totalAmount.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="text-muted-foreground text-center py-8">Select days to include in the invoice</p>
              )}

              <Separator />

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Payment terms: 30 days from receipt</p>
                {bankDetails && <p>Bank details: {bankDetails}</p>}
                <p>Rates as per APA Recommended Terms for Engaging Crew on Commercials (Effective 1st September 2025)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
