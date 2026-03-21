import { useState, useEffect } from 'react';
import { Settings, User, Building2, CreditCard, Plug, Save, Eye, EyeOff, Briefcase, Plus, Trash2, Pencil, X, Check, Package } from 'lucide-react';
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

interface EquipmentPackage {
  id: string;
  name: string;
  day_rate: number;
}

interface CustomRole {
  id: string;
  role_name: string;
  daily_rate: number;
  ot_coefficient: number;
  custom_bhr: number | null;
}

const OT_PRESETS = [
  { label: 'None (N/A)', value: '0' },
  { label: 'Grade III (x1.0)', value: '1.0' },
  { label: 'Grade II (x1.25)', value: '1.25' },
  { label: 'Grade I (x1.5)', value: '1.5' },
  { label: 'Custom', value: 'custom' },
];

function CustomRoleForm({
  initial,
  onSave,
  onCancel,
}: {
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
      ? String(initial.ot_coefficient)
      : ''
  );
  const [customBhr, setCustomBhr] = useState(
    initial?.custom_bhr != null ? String(initial.custom_bhr) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const rate = parseFloat(dailyRate) || 0;
  const otCoefficient = otPreset === 'custom' ? parseFloat(otCustom) || 0 : parseFloat(otPreset);
  const bhr = customBhr ? parseFloat(customBhr) : Math.round(rate / 10);
  const otRate = Math.round(bhr * otCoefficient);

  const handleSubmit = async () => {
    if (!roleName.trim()) { setError('Role name is required'); return; }
    if (rate <= 0) { setError('Daily rate must be greater than 0'); return; }
    setError('');
    setSaving(true);
    const err = await onSave({
      role_name: roleName.trim(),
      daily_rate: Math.round(rate),
      ot_coefficient: otCoefficient,
      custom_bhr: customBhr ? Math.round(parseFloat(customBhr)) : null,
    });
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <div className="space-y-4 p-4 rounded-xl border border-primary/20 bg-primary/5">
      <div className="space-y-2">
        <Label>Role / Grade Name</Label>
        <Input
          value={roleName}
          onChange={e => setRoleName(e.target.value)}
          placeholder="e.g. Senior Colourist, VFX Supervisor"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Default Daily Rate (£)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
            <Input
              type="number"
              className="pl-7"
              value={dailyRate}
              onChange={e => setDailyRate(e.target.value)}
              placeholder="500"
              min={0}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Overtime Coefficient</Label>
          <Select value={otPreset} onValueChange={setOtPreset}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OT_PRESETS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {otPreset === 'custom' && (
            <Input
              type="number"
              step="0.05"
              value={otCustom}
              onChange={e => setOtCustom(e.target.value)}
              placeholder="e.g. 1.33"
              min={0}
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Basic Hourly Rate (BHR) override</Label>
          <span className="text-xs text-muted-foreground">Leave blank to use daily rate ÷ 10</span>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
          <Input
            type="number"
            className="pl-7"
            value={customBhr}
            onChange={e => setCustomBhr(e.target.value)}
            placeholder={rate > 0 ? `${Math.round(rate / 10)} (auto)` : 'Auto'}
            min={0}
          />
        </div>
      </div>

      {/* Derived rates summary */}
      {rate > 0 && (
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">BHR</p>
            <p className="font-mono font-semibold">£{bhr}/hr</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">OT coefficient</p>
            <p className="font-mono font-semibold">x{otCoefficient || '—'}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">OT rate</p>
            <p className="font-mono font-semibold">{otCoefficient ? `£${otRate}/hr` : '—'}</p>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={saving}>
          <Check className="h-3.5 w-3.5 mr-1" />
          {saving ? 'Saving…' : 'Save Grade'}
        </Button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [department, setDepartment] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankSortCode, setBankSortCode] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

  // Custom roles
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Equipment packages
  const [equipmentPackages, setEquipmentPackages] = useState<EquipmentPackage[]>([]);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [newEquipmentName, setNewEquipmentName] = useState('');
  const [newEquipmentRate, setNewEquipmentRate] = useState('');
  const [editEquipmentName, setEditEquipmentName] = useState('');
  const [editEquipmentRate, setEditEquipmentRate] = useState('');

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

  const [customRolesError, setCustomRolesError] = useState<string | null>(null);

  const loadCustomRoles = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('custom_roles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) {
      setCustomRolesError(error.message);
    } else {
      setCustomRolesError(null);
      if (data) setCustomRoles(data as CustomRole[]);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    const payload = {
      user_id: user.id,
      display_name: displayName,
      phone,
      address,
      department,
      company_name: companyName,
      company_address: companyAddress,
      vat_number: vatNumber,
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

  const handleAddCustomRole = async (role: Omit<CustomRole, 'id'>): Promise<string | null> => {
    if (!user) return 'Not logged in';
    const { error } = await supabase
      .from('custom_roles')
      .insert({ ...role, user_id: user.id });
    if (error) return error.message;
    setShowAddForm(false);
    await loadCustomRoles();
    return null;
  };

  const handleUpdateCustomRole = async (id: string, role: Omit<CustomRole, 'id'>): Promise<string | null> => {
    const { error } = await supabase
      .from('custom_roles')
      .update({ ...role, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return error.message;
    setEditingId(null);
    await loadCustomRoles();
    return null;
  };

  const handleDeleteCustomRole = async (id: string) => {
    await supabase.from('custom_roles').delete().eq('id', id);
    await loadCustomRoles();
  };

  // Equipment package CRUD
  const [equipmentError, setEquipmentError] = useState<string | null>(null);

  const loadEquipmentPackages = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('equipment_packages').select('id, name, day_rate').eq('user_id', user.id).order('name');
    if (error) { setEquipmentError(error.message); }
    else { setEquipmentError(null); if (data) setEquipmentPackages(data); }
  };

  const handleAddEquipmentPackage = async () => {
    if (!user || !newEquipmentName.trim() || !newEquipmentRate) return;
    const { error } = await supabase.from('equipment_packages').insert({
      user_id: user.id,
      name: newEquipmentName.trim(),
      day_rate: parseFloat(newEquipmentRate),
    });
    if (error) { setEquipmentError(error.message); return; }
    setNewEquipmentName(''); setNewEquipmentRate(''); setShowAddEquipment(false);
    await loadEquipmentPackages();
  };

  const handleUpdateEquipmentPackage = async (id: string) => {
    if (!editEquipmentName.trim() || !editEquipmentRate) return;
    const { error } = await supabase.from('equipment_packages').update({ name: editEquipmentName.trim(), day_rate: parseFloat(editEquipmentRate) }).eq('id', id);
    if (error) { setEquipmentError(error.message); return; }
    setEditingEquipmentId(null);
    await loadEquipmentPackages();
  };

  const handleDeleteEquipmentPackage = async (id: string) => {
    await supabase.from('equipment_packages').delete().eq('id', id);
    await loadEquipmentPackages();
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
          <div className="space-y-2">
            <Label>My Department</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger>
                <SelectValue placeholder="Select your primary department…" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </CardContent>
      </Card>

      {/* Custom Grades */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Custom Rates
              </CardTitle>
              <CardDescription>Create your own job roles with custom rates and overtime rules</CardDescription>
            </div>
            {!showAddForm && (
              <Button size="sm" variant="outline" onClick={() => { setShowAddForm(true); setEditingId(null); }}>
                <Plus className="h-4 w-4 mr-1" /> Add Grade
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {customRolesError && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive space-y-1">
              <p className="font-medium">Could not load custom grades</p>
              <p className="text-xs opacity-80">{customRolesError}</p>
              <p className="text-xs opacity-70">If this table is missing, run the SQL from the setup instructions in Supabase.</p>
            </div>
          )}

          {showAddForm && (
            <CustomRoleForm
              onSave={handleAddCustomRole}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {customRoles.length === 0 && !showAddForm && !customRolesError && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom grades yet. Click "Add Grade" to create one.
            </p>
          )}

          {customRoles.map(role => (
            <div key={role.id}>
              {editingId === role.id ? (
                <CustomRoleForm
                  initial={role}
                  onSave={(r) => handleUpdateCustomRole(role.id, r)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className={cn(
                  'flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors'
                )}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{role.role_name}</span>
                      <Badge variant="secondary" className="text-xs">Custom</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span className="font-mono">£{role.daily_rate}/day</span>
                      <span>·</span>
                      <span className="font-mono">
                        BHR £{role.custom_bhr ?? Math.round(role.daily_rate / 10)}/hr
                      </span>
                      <span>·</span>
                      <span>
                        OT x{role.ot_coefficient}
                        {role.ot_coefficient > 0 && (
                          <span className="font-mono ml-1">
                            (£{Math.round((role.custom_bhr ?? Math.round(role.daily_rate / 10)) * role.ot_coefficient)}/hr)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => { setEditingId(role.id); setShowAddForm(false); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteCustomRole(role.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* My Equipment */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                My Equipment
              </CardTitle>
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
                <Button size="sm" onClick={handleAddEquipmentPackage} disabled={!newEquipmentName.trim() || !newEquipmentRate}>
                  <Check className="h-4 w-4 mr-1" /> Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowAddEquipment(false); setNewEquipmentName(''); setNewEquipmentRate(''); }}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          )}

          {equipmentError && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive space-y-1">
              <p className="font-medium">Could not save equipment package</p>
              <p className="text-xs opacity-80">{equipmentError}</p>
              <p className="text-xs opacity-70">If this table is missing, run the SQL from the setup instructions in Supabase.</p>
            </div>
          )}

          {equipmentPackages.length === 0 && !showAddEquipment && !equipmentError && (
            <p className="text-sm text-muted-foreground text-center py-4">No equipment packages yet. Click "Add Package" to create one.</p>
          )}

          {equipmentPackages.map(pkg => (
            <div key={pkg.id}>
              {editingEquipmentId === pkg.id ? (
                <div className="rounded-xl border border-border p-4 space-y-3 bg-muted/30">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Package Name</Label>
                      <Input value={editEquipmentName} onChange={e => setEditEquipmentName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Day Rate (£)</Label>
                      <Input type="number" value={editEquipmentRate} onChange={e => setEditEquipmentRate(e.target.value)} min="0" step="0.01" />
                    </div>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingEquipmentId(pkg.id); setEditEquipmentName(pkg.name); setEditEquipmentRate(String(pkg.day_rate)); setShowAddEquipment(false); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteEquipmentPackage(pkg.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
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
