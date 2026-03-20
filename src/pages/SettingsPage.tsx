import { useState, useEffect } from 'react';
import { Settings, User, Building2, CreditCard, Plug, Save, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export function SettingsPage() {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankSortCode, setBankSortCode] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('user_settings').select('*').eq('user_id', user.id).single().then(({ data }) => {
      if (data) {
        setDisplayName(data.display_name ?? '');
        setPhone(data.phone ?? '');
        setAddress(data.address ?? '');
        setCompanyName(data.company_name ?? '');
        setCompanyAddress(data.company_address ?? '');
        setBankAccountName(data.bank_account_name ?? '');
        setBankSortCode(data.bank_sort_code ?? '');
        setBankAccountNumber(data.bank_account_number ?? '');
      }
    });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    const payload = {
      user_id: user.id,
      display_name: displayName,
      phone,
      address,
      company_name: companyName,
      company_address: companyAddress,
      bank_account_name: bankAccountName,
      bank_sort_code: bankSortCode,
      bank_account_number: bankAccountNumber,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* User Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Details
          </CardTitle>
          <CardDescription>Your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ''} disabled className="opacity-60" />
          </div>
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your full name" />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 7700 000000" />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Film Street, London, W1A 1AA" />
          </div>
        </CardContent>
      </Card>

      {/* Company Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Details
          </CardTitle>
          <CardDescription>Used to pre-fill your invoice details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your Company Ltd" />
          </div>
          <div className="space-y-2">
            <Label>Company Address</Label>
            <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="123 Studio Road, London, W1A 1AA" />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Bank Details</p>
              <p className="text-xs text-muted-foreground">Stored securely — only visible to you</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowBankDetails(!showBankDetails)}>
              {showBankDetails ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
              {showBankDetails ? 'Hide' : 'Show'}
            </Button>
          </div>

          {showBankDetails && (
            <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border">
              <div className="space-y-2">
                <Label>Account Name</Label>
                <Input value={bankAccountName} onChange={e => setBankAccountName(e.target.value)} placeholder="Your Name or Company Ltd" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Sort Code</Label>
                  <Input value={bankSortCode} onChange={e => setBankSortCode(e.target.value)} placeholder="12-34-56" maxLength={8} />
                </div>
                <div className="space-y-2">
                  <Label>Account Number</Label>
                  <Input value={bankAccountNumber} onChange={e => setBankAccountNumber(e.target.value)} placeholder="12345678" maxLength={8} />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing */}
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Billing
            <Badge variant="secondary">Coming Soon</Badge>
          </CardTitle>
          <CardDescription>Manage your subscription and payment methods</CardDescription>
        </CardHeader>
      </Card>

      {/* Integrations */}
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Integrations
            <Badge variant="secondary">Coming Soon</Badge>
          </CardTitle>
          <CardDescription>Connect with Xero, QuickBooks, FreeAgent and more</CardDescription>
        </CardHeader>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        <Save className="h-4 w-4 mr-2" />
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </Button>
    </div>
  );
}
