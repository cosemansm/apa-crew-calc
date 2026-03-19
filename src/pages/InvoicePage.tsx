import { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { FileText, Download, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface SavedCalc {
  id: string;
  created_at: string;
  project_name: string;
  role_name: string;
  agreed_rate: number;
  day_type: string;
  day_of_week: string;
  call_time: string;
  wrap_time: string;
  grand_total: number;
  result_json: {
    lineItems?: { description: string; total: number }[];
    penalties?: { description: string; total: number }[];
    holidayPay?: number;
    travelPay?: number;
    mileage?: number;
  };
}

export function InvoicePage() {
  const { user } = useAuth();
  const [calculations, setCalculations] = useState<SavedCalc[]>([]);
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
      .from('calculations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setCalculations(data as SavedCalc[]);
      });
  }, [user]);

  const selectedCalcs = calculations.filter(c => selected.includes(c.id));
  const totalAmount = selectedCalcs.reduce((sum, c) => sum + c.grand_total, 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="h-6 w-6" />
        Invoice Generator
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoice Config */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
            <CardDescription>Fill in your details and select calculations to include</CardDescription>
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
              <Input value={bankDetails} onChange={e => setBankDetails(e.target.value)} placeholder="Sort: 12-34-56, Acc: 12345678" />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Select Calculations to Include</Label>
              {calculations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved calculations. Save one from the calculator first.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {calculations.map(calc => (
                    <label key={calc.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.includes(calc.id)}
                        onChange={e => {
                          if (e.target.checked) setSelected([...selected, calc.id]);
                          else setSelected(selected.filter(id => id !== calc.id));
                        }}
                        className="rounded"
                      />
                      <div className="flex-1 text-sm">
                        <span className="font-medium">{calc.project_name}</span>
                        <span className="text-muted-foreground"> - {calc.role_name} ({calc.day_of_week})</span>
                      </div>
                      <span className="font-mono text-sm">£{calc.grand_total.toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Invoice Preview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Preview</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={printRef} className="space-y-6 text-sm print:text-xs">
              <div className="flex justify-between">
                <div>
                  <p className="font-bold text-lg">{companyName || 'Your Company'}</p>
                  <p className="text-muted-foreground">{companyAddress}</p>
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

              {selectedCalcs.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Description</th>
                      <th className="text-left py-2">Date</th>
                      <th className="text-right py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCalcs.map(calc => (
                      <tr key={calc.id} className="border-b">
                        <td className="py-2">
                          <p className="font-medium">{calc.project_name}</p>
                          <p className="text-muted-foreground">
                            {calc.role_name} - {calc.day_type.replace(/_/g, ' ')} ({calc.day_of_week})
                          </p>
                          <p className="text-muted-foreground">
                            Call: {calc.call_time} - Wrap: {calc.wrap_time}
                          </p>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {format(new Date(calc.created_at), 'dd/MM/yy')}
                        </td>
                        <td className="py-2 text-right font-mono">£{calc.grand_total.toFixed(2)}</td>
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
                <p className="text-muted-foreground text-center py-8">Select calculations to include in the invoice</p>
              )}

              <Separator />

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Payment terms: 7 days from receipt</p>
                {bankDetails && <p>Bank details: {bankDetails}</p>}
                <p>Rates as per APA Recommended Terms for Engaging Crew on Commercials (Effective 1st September 2025)</p>
                <p>Holiday pay (12.07%) included in all calculations as per statutory entitlement.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
