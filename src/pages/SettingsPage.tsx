import { useState, useEffect } from 'react';
import {
  Settings, User, Building2, CreditCard, Plug, Save,
  Eye, EyeOff, Briefcase, Plus, Trash2, Pencil, X, Check,
  Package, Lock, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { DEPARTMENTS } from '@/data/apa-rates';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EquipmentPackage { id: string; name: string; day_rate: number; }
interface CustomRole {
  id: string; role_name: string; daily_rate: number;
  ot_coefficient: number; custom_bhr: number | null;
  is_buyout: boolean;
}

const OT_PRESETS = [
  { label: 'None (N/A)', value: '0' },
  { label: 'Grade III (x1.0)', value: '1.0' },
  { label: 'Grade II (x1.25)', value: '1.25' },
  { label: 'Grade I (x1.5)', value: '1.5' },
  { label: 'Custom', value: 'custom' },
];

// ─── Custom Role Form ──────────────────────────────────────────────────────────

function CustomRoleForm({ initial, onSave, onCancel }: {
  initial?: Partial<CustomRole>;
  onSave: (role: Omit<CustomRole, 'id'>) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [roleName, setRoleName] = useState(initial?.role_name ?? '');
  const [dailyRate, setDailyRate] = useState(String(initial?.daily_rate ?? ''));
  const [otPreset, setOtPreset] = useState(() => {
    const v = initial?.ot_coefficient;
    if (v === undefined) return '1.5';
    if (v === 0) return '0';
    if ([1.0, 1.25, 1.5].includes(v)) return String(v);
    return 'custom';
  });
  const [otCustom, setOtCustom] = useState(
    initial?.ot_coefficient && ![0, 1.0, 1.25, 1.5].includes(initial.ot_coefficient)
      ? String(initial.ot_coefficient) : ''
  );
  const [customBhr, setCustomBhr] = useState(
    initial?.custom_bhr != null ? String(initial.custom_bhr) : ''
  );
  const [isBuyout, setIsBuyout] = useState(initial?.is_buyout ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const rate = parseFloat(dailyRate) || 0;
  const otCoefficient = otPreset === 'custom' ? parseFloat(otCustom) || 0 : parseFloat(otPreset);
  const bhr = customBhr ? parseFloat(customBhr) : Math.round(rate / 10);
  const otRate = Math.round(bhr * otCoefficient);

  const handleSubmit = async () => {
    if (!roleName.trim()) { setError('Role name is required'); return; }
    if (rate <= 0) { setError('Daily rate must be greater than 0'); return; }
    setError(''); setSaving(true);
    const err = await onSave({
      role_name: roleName.trim(),
      daily_rate: Math.round(rate),
      ot_coefficient: isBuyout ? 0 : otCoefficient,
      custom_bhr: isBuyout ? null : (customBhr ? Math.round(parseFloat(customBhr)) : null),
      is_buyout: isBuyout,
    });
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <div className="space-y-4 p-4 rounded-xl border border-primary/20 bg-primary/5">
      <div className="space-y-2">
        <Label>Role / Grade Name</Label>
        <Input value={roleName} onChange={e => setRoleName(e.target.value)} placeholder="e.g. Senior Colourist" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Default Daily Rate (£)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
            <Input type="number" className="pl-7" value={dailyRate} onChange={e => setDailyRate(e.target.value)} placeholder="500" min={0} />
          </div>
        </div>
        <div className={cn('space-y-2', isBuyout && 'opacity-40 pointer-events-none')}>
          <Label>Overtime Coefficient</Label>
          <Select value={otPreset} onValueChange={setOtPreset} disabled={isBuyout}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OT_PRESETS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {otPreset === 'custom' && (
            <Input type="number" step="0.05" value={otCustom} onChange={e => setOtCustom(e.target.value)} placeholder="e.g. 1.33" min={0} />
          )}
        </div>
      </div>
      <div className={cn('space-y-2', isBuyout && 'opacity-40 pointer-events-none')}>
        <div className="flex items-center justify-between">
          <Label>BHR override</Label>
          <span className="text-xs text-muted-foreground">Blank = daily rate ÷ 10</span>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
          <Input type="number" className="pl-7" value={customBhr} onChange={e => setCustomBhr(e.target.value)} placeholder={rate > 0 ? `${Math.round(rate / 10)} (auto)` : 'Auto'} min={0} disabled={isBuyout} />
        </div>
      </div>
      {/* Flat rate toggle — discrete, no mention of the b-word in the UI */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => setIsBuyout(b => !b)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none',
            isBuyout ? 'bg-primary' : 'bg-input'
          )}
          role="switch"
          aria-checked={isBuyout}
        >
          <span className={cn(
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
            isBuyout ? 'translate-x-4' : 'translate-x-0'
          )} />
        </button>
        <div>
          <Label className="text-sm cursor-pointer" onClick={() => setIsBuyout(b => !b)}>Buyout</Label>
        </div>
      </div>
      {rate > 0 && !isBuyout && (
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <div className="text-center"><p className="text-xs text-muted-foreground">BHR</p><p className="font-mono font-semibold">£{bhr}/hr</p></div>
          <div className="text-center"><p className="text-xs text-muted-foreground">OT coefficient</p><p className="font-mono font-semibold">x{otCoefficient || '—'}</p></div>
          <div className="text-center"><p className="text-xs text-muted-foreground">OT rate</p><p className="font-mono font-semibold">{otCoefficient ? `£${otRate}/hr` : '—'}</p></div>
        </div>
      )}
      {rate > 0 && isBuyout && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm text-center">
          <p className="text-xs text-muted-foreground">Total charged per day</p>
          <p className="font-mono font-semibold">£{rate.toFixed(0)}</p>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
        <Button size="sm" onClick={handleSubmit} disabled={saving}><Check className="h-3.5 w-3.5 mr-1" />{saving ? 'Saving…' : 'Save Rate'}</Button>
      </div>
    </div>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────

type SectionId = 'user-details' | 'company-details' | 'custom-rates' | 'my-equipment' | 'password' | 'billing' | 'integrations' | 'danger-zone';

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ElementType; badge?: string; danger?: boolean }[] = [
  { id: 'user-details',     label: 'User Details',     icon: User },
  { id: 'company-details',  label: 'Company Details',  icon: Building2 },
  { id: 'custom-rates',     label: 'Custom Rates',     icon: Briefcase },
  { id: 'my-equipment',     label: 'My Equipment',     icon: Package },
  { id: 'password',         label: 'Password',         icon: Lock },
  { id: 'billing',          label: 'Billing',          icon: CreditCard, badge: 'Soon' },
  { id: 'integrations',     label: 'Integrations',     icon: Plug,       badge: 'Soon' },
  { id: 'danger-zone',      label: 'Danger Zone',      icon: AlertTriangle, danger: true },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionId>('user-details');

  // User details
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [department, setDepartment] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [savedUser, setSavedUser] = useState(false);

  // Company details
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankSortCode, setBankSortCode] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savedCompany, setSavedCompany] = useState(false);

  // Password
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState(false);

  // Custom roles
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customRolesError, setCustomRolesError] = useState<string | null>(null);

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Equipment packages
  const [equipmentPackages, setEquipmentPackages] = useState<EquipmentPackage[]>([]);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [newEquipmentName, setNewEquipmentName] = useState('');
  const [newEquipmentRate, setNewEquipmentRate] = useState('');
  const [editEquipmentName, setEditEquipmentName] = useState('');
  const [editEquipmentRate, setEditEquipmentRate] = useState('');
  const [equipmentError, setEquipmentError] = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    supabase.from('user_settings').select('*').eq('user_id', user.id).single().then(({ data }) => {
      if (data) {
        setDisplayName(data.display_name ?? '');
        setPhone(data.phone ?? '');
        setAddress(data.address ?? '');
        setDepartment(data.department ?? '');
        setCompanyName(data.company_name ?? '');
        setCompanyAddress(data.company_address ?? '');
        setVatNumber(data.vat_number ?? '');
        setBankAccountName(data.bank_account_name ?? '');
        setBankSortCode(data.bank_sort_code ?? '');
        setBankAccountNumber(data.bank_account_number ?? '');
      }
    });
    loadCustomRoles();
    loadEquipmentPackages();
  }, [user]);

  // ── Save helpers ──────────────────────────────────────────────────────────

  const upsertSettings = async (patch: Record<string, unknown>) => {
    if (!user) return;
    await supabase.from('user_settings').upsert(
      { user_id: user.id, updated_at: new Date().toISOString(), ...patch },
      { onConflict: 'user_id' }
    );
  };

  const handleSaveUser = async () => {
    setSavingUser(true); setSavedUser(false);
    await upsertSettings({ display_name: displayName, phone, address, department });
    setSavingUser(false); setSavedUser(true);
    setTimeout(() => setSavedUser(false), 3000);
  };

  const handleSaveCompany = async () => {
    setSavingCompany(true); setSavedCompany(false);
    await upsertSettings({
      company_name: companyName, company_address: companyAddress,
      vat_number: vatNumber, bank_account_name: bankAccountName,
      bank_sort_code: bankSortCode, bank_account_number: bankAccountNumber,
    });
    setSavingCompany(false); setSavedCompany(true);
    setTimeout(() => setSavedCompany(false), 3000);
  };

  const handleChangePassword = async () => {
    setPwdError(null); setPwdSuccess(false);
    if (newPassword.length < 6) { setPwdError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setPwdError('Passwords do not match'); return; }
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPwd(false);
    if (error) { setPwdError(error.message); }
    else { setPwdSuccess(true); setNewPassword(''); setConfirmPassword(''); setTimeout(() => setPwdSuccess(false), 4000); }
  };

  // ── Delete account ────────────────────────────────────────────────────────

  const handleDeleteAccount = async () => {
    if (!user) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        setDeleteError(data.error || 'Failed to delete account');
        setIsDeleting(false);
        return;
      }
      // Account deleted — sign out and let AuthContext redirect to login
      await supabase.auth.signOut();
    } catch (err) {
      setDeleteError(String(err));
      setIsDeleting(false);
    }
  };

  // ── Custom roles ──────────────────────────────────────────────────────────

  const loadCustomRoles = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('custom_roles').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
    if (error) { setCustomRolesError(error.message); }
    else { setCustomRolesError(null); if (data) setCustomRoles(data as CustomRole[]); }
  };

  const handleAddCustomRole = async (role: Omit<CustomRole, 'id'>): Promise<string | null> => {
    if (!user) return 'Not logged in';
    const { error } = await supabase.from('custom_roles').insert({ ...role, user_id: user.id });
    if (error) return error.message;
    setShowAddForm(false); await loadCustomRoles(); return null;
  };

  const handleUpdateCustomRole = async (id: string, role: Omit<CustomRole, 'id'>): Promise<string | null> => {
    const { error } = await supabase.from('custom_roles').update({ ...role, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return error.message;
    setEditingId(null); await loadCustomRoles(); return null;
  };

  const handleDeleteCustomRole = async (id: string) => {
    await supabase.from('custom_roles').delete().eq('id', id);
    await loadCustomRoles();
  };

  // ── Equipment ─────────────────────────────────────────────────────────────

  const loadEquipmentPackages = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('equipment_packages').select('id, name, day_rate').eq('user_id', user.id).order('name');
    if (error) { setEquipmentError(error.message); }
    else { setEquipmentError(null); if (data) setEquipmentPackages(data); }
  };

  const handleAddEquipmentPackage = async () => {
    if (!user || !newEquipmentName.trim() || !newEquipmentRate) return;
    const { error } = await supabase.from('equipment_packages').insert({ user_id: user.id, name: newEquipmentName.trim(), day_rate: parseFloat(newEquipmentRate) });
    if (error) { setEquipmentError(error.message); return; }
    setNewEquipmentName(''); setNewEquipmentRate(''); setShowAddEquipment(false);
    await loadEquipmentPackages();
  };

  const handleUpdateEquipmentPackage = async (id: string) => {
    if (!editEquipmentName.trim() || !editEquipmentRate) return;
    const { error } = await supabase.from('equipment_packages').update({ name: editEquipmentName.trim(), day_rate: parseFloat(editEquipmentRate) }).eq('id', id);
    if (error) { setEquipmentError(error.message); return; }
    setEditingEquipmentId(null); await loadEquipmentPackages();
  };

  const handleDeleteEquipmentPackage = async (id: string) => {
    await supabase.from('equipment_packages').delete().eq('id', id);
    await loadEquipmentPackages();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <div className="flex gap-6 items-start">

        {/* ── Left sidebar nav ── */}
        <div className="w-52 shrink-0">
          <nav className="space-y-0.5">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => !item.badge && setActiveSection(item.id)}
                disabled={!!item.badge}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left',
                  activeSection === item.id
                    ? item.danger ? 'bg-red-600 text-white' : 'bg-[#1F1F21] text-white'
                    : item.badge
                      ? 'text-muted-foreground/50 cursor-not-allowed'
                      : item.danger
                        ? 'text-red-500 hover:bg-red-50 hover:text-red-600'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.badge
                  ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{item.badge}</Badge>
                  : activeSection === item.id
                    ? <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                    : null
                }
              </button>
            ))}
          </nav>
        </div>

        {/* ── Right content panel ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* USER DETAILS */}
          {activeSection === 'user-details' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> User Details</CardTitle>
                <CardDescription>Your personal information and primary department</CardDescription>
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
                <div className="space-y-2">
                  <Label>My Department</Label>
                  <Select value={department} onValueChange={setDepartment}>
                    <SelectTrigger><SelectValue placeholder="Select your primary department…" /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map(dept => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSaveUser} disabled={savingUser} className="w-full mt-2">
                  <Save className="h-4 w-4 mr-2" />
                  {savingUser ? 'Saving…' : savedUser ? '✓ Saved!' : 'Save User Details'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* COMPANY DETAILS */}
          {activeSection === 'company-details' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Company Details</CardTitle>
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
                <div className="space-y-2">
                  <Label>VAT Number</Label>
                  <Input value={vatNumber} onChange={e => setVatNumber(e.target.value)} placeholder="GB 123 4567 89" />
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

                <Button onClick={handleSaveCompany} disabled={savingCompany} className="w-full mt-2">
                  <Save className="h-4 w-4 mr-2" />
                  {savingCompany ? 'Saving…' : savedCompany ? '✓ Saved!' : 'Save Company Details'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* CUSTOM RATES */}
          {activeSection === 'custom-rates' && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" /> Custom Rates</CardTitle>
                    <CardDescription>Create your own job roles with custom rates and overtime rules</CardDescription>
                  </div>
                  {!showAddForm && (
                    <Button size="sm" variant="outline" onClick={() => { setShowAddForm(true); setEditingId(null); }}>
                      <Plus className="h-4 w-4 mr-1" /> Add Rate
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {customRolesError && (
                  <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive space-y-1">
                    <p className="font-medium">Could not load custom grades</p>
                    <p className="text-xs opacity-80">{customRolesError}</p>
                  </div>
                )}
                {showAddForm && (
                  <CustomRoleForm onSave={handleAddCustomRole} onCancel={() => setShowAddForm(false)} />
                )}
                {customRoles.length === 0 && !showAddForm && !customRolesError && (
                  <p className="text-sm text-muted-foreground text-center py-8">No custom rates yet. Click "Add Rate" to create one.</p>
                )}
                {customRoles.map(role => (
                  <div key={role.id}>
                    {editingId === role.id ? (
                      <CustomRoleForm initial={role} onSave={(r) => handleUpdateCustomRole(role.id, r)} onCancel={() => setEditingId(null)} />
                    ) : (
                      <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{role.role_name}</span>
                            <Badge variant="secondary" className="text-xs">Custom</Badge>
                            {role.is_buyout && <Badge variant="outline" className="text-xs text-muted-foreground">All-in</Badge>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span className="font-mono">£{role.daily_rate}/day</span>
                            {!role.is_buyout && (<>
                              <span>·</span>
                              <span className="font-mono">BHR £{role.custom_bhr ?? Math.round(role.daily_rate / 10)}/hr</span>
                              <span>·</span>
                              <span>OT x{role.ot_coefficient}{role.ot_coefficient > 0 && <span className="font-mono ml-1">(£{Math.round((role.custom_bhr ?? Math.round(role.daily_rate / 10)) * role.ot_coefficient)}/hr)</span>}</span>
                            </>)}
                            {role.is_buyout && <><span>·</span><span>flat rate, no OT</span></>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingId(role.id); setShowAddForm(false); }}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteCustomRole(role.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* MY EQUIPMENT */}
          {activeSection === 'my-equipment' && (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> My Equipment</CardTitle>
                    <CardDescription>Save equipment packages with a day rate to quickly load in the calculator</CardDescription>
                  </div>
                  {!showAddEquipment && (
                    <Button size="sm" variant="outline" onClick={() => { setShowAddEquipment(true); setEditingEquipmentId(null); }}>
                      <Plus className="h-4 w-4 mr-1" /> Add Package
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {showAddEquipment && (
                  <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/30">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Package Name</Label>
                        <Input value={newEquipmentName} onChange={e => setNewEquipmentName(e.target.value)} placeholder="e.g. Full Lighting Kit" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Day Rate (£)</Label>
                        <Input type="number" value={newEquipmentRate} onChange={e => setNewEquipmentRate(e.target.value)} placeholder="0.00" min="0" step="0.01" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddEquipmentPackage} disabled={!newEquipmentName.trim() || !newEquipmentRate}><Check className="h-4 w-4 mr-1" /> Save</Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowAddEquipment(false); setNewEquipmentName(''); setNewEquipmentRate(''); }}><X className="h-4 w-4 mr-1" /> Cancel</Button>
                    </div>
                  </div>
                )}
                {equipmentError && (
                  <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive space-y-1">
                    <p className="font-medium">Could not save equipment package</p>
                    <p className="text-xs opacity-80">{equipmentError}</p>
                  </div>
                )}
                {equipmentPackages.length === 0 && !showAddEquipment && !equipmentError && (
                  <p className="text-sm text-muted-foreground text-center py-8">No equipment packages yet. Click "Add Package" to create one.</p>
                )}
                {equipmentPackages.map(pkg => (
                  <div key={pkg.id}>
                    {editingEquipmentId === pkg.id ? (
                      <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/30">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5"><Label className="text-xs">Package Name</Label><Input value={editEquipmentName} onChange={e => setEditEquipmentName(e.target.value)} /></div>
                          <div className="space-y-1.5"><Label className="text-xs">Day Rate (£)</Label><Input type="number" value={editEquipmentRate} onChange={e => setEditEquipmentRate(e.target.value)} min="0" step="0.01" /></div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleUpdateEquipmentPackage(pkg.id)}><Check className="h-4 w-4 mr-1" /> Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingEquipmentId(null)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                        <div>
                          <p className="font-medium text-sm">{pkg.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">£{pkg.day_rate}/day</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingEquipmentId(pkg.id); setEditEquipmentName(pkg.name); setEditEquipmentRate(String(pkg.day_rate)); setShowAddEquipment(false); }}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteEquipmentPackage(pkg.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* PASSWORD */}
          {activeSection === 'password' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Change Password</CardTitle>
                <CardDescription>Update the password for {user?.email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pwdError && (
                  <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-xl border border-destructive/20">{pwdError}</div>
                )}
                {pwdSuccess && (
                  <div className="p-3 text-sm text-green-700 bg-green-50 rounded-xl border border-green-200">✓ Password updated successfully.</div>
                )}
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Input
                      type={showNewPwd ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPwd(!showNewPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      type={showConfirmPwd ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your new password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  onClick={handleChangePassword}
                  disabled={savingPwd || !newPassword || !confirmPassword}
                  className="w-full mt-2"
                >
                  <Lock className="h-4 w-4 mr-2" />
                  {savingPwd ? 'Updating…' : 'Update Password'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* BILLING */}
          {activeSection === 'billing' && (
            <Card className="opacity-60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Billing <Badge variant="secondary">Coming Soon</Badge></CardTitle>
                <CardDescription>Manage your subscription and payment methods</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Billing management will be available in a future update.</p>
              </CardContent>
            </Card>
          )}

          {/* INTEGRATIONS */}
          {activeSection === 'integrations' && (
            <Card className="opacity-60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5" /> Integrations <Badge variant="secondary">Coming Soon</Badge></CardTitle>
                <CardDescription>Connect with Xero, QuickBooks, FreeAgent and more</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Accounting integrations will be available in a future update.</p>
              </CardContent>
            </Card>
          )}

          {/* DANGER ZONE */}
          {activeSection === 'danger-zone' && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" /> Danger Zone
                </CardTitle>
                <CardDescription>Irreversible and destructive actions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-red-200 bg-red-50 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-red-700">Delete Account</p>
                      <p className="text-sm text-red-600/80 mt-1">
                        Permanently delete your account and all associated data including jobs, days, invoices, and settings.
                        This action <strong>cannot be undone</strong>.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="shrink-0"
                      onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError(null); }}
                    >
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      Delete Account
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* DELETE ACCOUNT MODAL */}
          {showDeleteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-red-700">Delete Account</h3>
                    <p className="text-sm text-muted-foreground">This action cannot be undone</p>
                  </div>
                </div>

                {/* Warning */}
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 space-y-1">
                  <p className="font-semibold">You will permanently lose:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-red-600/90 mt-1">
                    <li>All your jobs and booking days</li>
                    <li>All invoice history</li>
                    <li>All custom rates and equipment packages</li>
                    <li>All settings and account data</li>
                  </ul>
                  <p className="mt-2 font-medium">All data will be removed from our servers immediately.</p>
                </div>

                {/* Confirm input */}
                <div className="space-y-2">
                  <Label className="text-sm">
                    Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm
                  </Label>
                  <Input
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE here"
                    className="border-red-200 focus:border-red-400"
                    autoFocus
                  />
                </div>

                {deleteError && (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {deleteError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                    onClick={handleDeleteAccount}
                  >
                    {isDeleting ? 'Deleting…' : 'Permanently Delete My Account'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteModal(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
