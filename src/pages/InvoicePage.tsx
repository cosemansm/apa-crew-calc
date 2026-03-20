import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { FileText, Printer, FolderOpen, CheckSquare, Square } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
  client_name: string | null;
}

interface ProjectDay {
  id: string;
  project_id: string;
  work_date: string;
  role_name: string;
  day_type: string;
  call_time: string;
  wrap_time: string;
  grand_total: number;
  projects: { name: string; client_name: string | null } | null;
}

export function InvoicePage() {
  const { user } = useAuth();
  const location = useLocation();

  // All data
  const [projects, setProjects] = useState<Project[]>([]);
  const [allDays, setAllDays] = useState<ProjectDay[]>([]);

  // Invoice state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${Date.now().toString(36).toUpperCase()}`);

  // From / To details
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [bankDetails, setBankDetails] = useState('');

  const projectPickerRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Load projects and all days
  useEffect(() => {
    if (!user) return;

    supabase
      .from('projects')
      .select('id, name, client_name')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => { if (data) setProjects(data); });

    supabase
      .from('project_days')
      .select('id, project_id, work_date, role_name, day_type, call_time, wrap_time, grand_total, projects(name, client_name)')
      .order('work_date', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setAllDays(data as ProjectDay[]);

          // If navigated here with a pre-selected day id, find its project and select all days from it
          const preselect = (location.state as { dayId?: string } | null)?.dayId;
          if (preselect) {
            const preselectDay = (data as ProjectDay[]).find(d => d.id === preselect);
            if (preselectDay) {
              const projId = preselectDay.project_id;
              setSelectedProjectId(projId);
              const projDays = (data as ProjectDay[]).filter(d => d.project_id === projId);
              setSelected(projDays.map(d => d.id));
              if (preselectDay.projects?.client_name) {
                setClientName(preselectDay.projects.client_name);
              }
            }
          }
        }
      });

    // Load user settings for pre-fill
    supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          if (data.company_name) setCompanyName(data.company_name);
          if (data.company_address) setCompanyAddress(data.company_address);
          if (data.bank_account_name && data.bank_sort_code && data.bank_account_number) {
            setBankDetails(`${data.bank_account_name} | Sort: ${data.bank_sort_code} | Acc: ${data.bank_account_number}`);
          }
        }
      });
  }, [user]);

  // Close picker on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (projectPickerRef.current && !projectPickerRef.current.contains(e.target as Node)) {
        setShowProjectPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectProject = (proj: Project) => {
    setSelectedProjectId(proj.id);
    setShowProjectPicker(false);
    // Auto-select all days for this project
    const projDays = allDays.filter(d => d.project_id === proj.id);
    setSelected(projDays.map(d => d.id));
    // Auto-fill client name from project
    if (proj.client_name) setClientName(proj.client_name);
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const visibleDays = selectedProjectId
    ? allDays.filter(d => d.project_id === selectedProjectId)
    : allDays;

  const selectedDays = allDays.filter(d => selected.includes(d.id));
  const totalAmount = selectedDays.reduce((sum, d) => sum + (d.grand_total || 0), 0);

  const allVisibleSelected = visibleDays.length > 0 && visibleDays.every(d => selected.includes(d.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected(prev => prev.filter(id => !visibleDays.find(d => d.id === id)));
    } else {
      setSelected(prev => [...new Set([...prev, ...visibleDays.map(d => d.id)])]);
    }
  };

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
            <CardDescription>Select a project, then review and fill in your details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Project selector */}
            <div className="space-y-2">
              <Label>Project</Label>
              <div className="relative" ref={projectPickerRef}>
                <button
                  onClick={() => setShowProjectPicker(!showProjectPicker)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm text-left transition-colors hover:bg-muted/50',
                    selectedProject ? 'border-primary/40 bg-primary/5' : 'border-input bg-background'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {selectedProject ? (
                      <div className="min-w-0">
                        <span className="font-medium truncate">{selectedProject.name}</span>
                        {selectedProject.client_name && (
                          <span className="text-muted-foreground ml-1.5">— {selectedProject.client_name}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Select a project…</span>
                    )}
                  </div>
                  {selectedProject && (
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {visibleDays.length} day{visibleDays.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </button>

                {showProjectPicker && (
                  <div className="absolute left-0 right-0 top-11 rounded-2xl border border-white/20 bg-white/95 backdrop-blur-xl shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border/40">
                      <p className="text-xs font-semibold text-muted-foreground">Choose project to invoice</p>
                    </div>
                    {projects.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-muted-foreground text-center">No projects yet</div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto py-1">
                        {projects.map(proj => {
                          const dayCount = allDays.filter(d => d.project_id === proj.id).length;
                          return (
                            <button
                              key={proj.id}
                              onClick={() => handleSelectProject(proj)}
                              className={cn(
                                'w-full text-left px-4 py-3 text-sm hover:bg-primary/5 transition-colors flex items-center justify-between gap-3',
                                proj.id === selectedProjectId && 'bg-primary/10'
                              )}
                            >
                              <div className="min-w-0">
                                <p className="font-medium truncate">{proj.name}</p>
                                {proj.client_name && (
                                  <p className="text-xs text-muted-foreground">{proj.client_name}</p>
                                )}
                              </div>
                              <Badge variant="outline" className="text-xs shrink-0">
                                {dayCount} day{dayCount !== 1 ? 's' : ''}
                              </Badge>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Invoice number / date */}
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

            {/* From */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Your Name / Company</Label>
                {!companyName && (
                  <span className="text-xs text-amber-600">Not set — add in Settings</span>
                )}
              </div>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your Company Ltd" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Your Address</Label>
                {!companyAddress && (
                  <span className="text-xs text-amber-600">Not set — add in Settings</span>
                )}
              </div>
              <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="123 Film Street, London" />
            </div>

            <Separator />

            {/* To */}
            <div className="space-y-2">
              <Label>Client / Production Company</Label>
              <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Production Co. Ltd" />
            </div>
            <div className="space-y-2">
              <Label>Client Address</Label>
              <Input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="456 Studio Road, London" />
            </div>

            <Separator />

            {/* Bank details */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bank Details</Label>
                {!bankDetails && (
                  <span className="text-xs text-amber-600">Not set — add in Settings</span>
                )}
              </div>
              <Input value={bankDetails} onChange={e => setBankDetails(e.target.value)} placeholder="Account Name | Sort: 12-34-56 | Acc: 12345678" />
            </div>

            <Separator />

            {/* Day selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Days to Invoice</Label>
                {visibleDays.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {allVisibleSelected
                      ? <><CheckSquare className="h-3.5 w-3.5" /> Deselect all</>
                      : <><Square className="h-3.5 w-3.5" /> Select all</>
                    }
                  </button>
                )}
              </div>

              {!selectedProjectId ? (
                <p className="text-sm text-muted-foreground py-2">Select a project above to see its days.</p>
              ) : visibleDays.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No saved days for this project yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {visibleDays.map((day, idx) => (
                    <label
                      key={day.id}
                      className={cn(
                        'flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors',
                        selected.includes(day.id) ? 'bg-primary/8 border border-primary/20' : 'hover:bg-muted border border-transparent'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(day.id)}
                        onChange={e => {
                          if (e.target.checked) setSelected(prev => [...prev, day.id]);
                          else setSelected(prev => prev.filter(id => id !== day.id));
                        }}
                        className="rounded"
                      />
                      <div className="flex-1 text-sm min-w-0">
                        <span className="font-medium">Day {idx + 1}</span>
                        <span className="text-muted-foreground"> · {day.role_name}</span>
                        {day.work_date && (
                          <span className="text-muted-foreground"> · {format(parseISO(day.work_date), 'EEE dd MMM')}</span>
                        )}
                      </div>
                      <span className="font-mono text-sm shrink-0">£{(day.grand_total || 0).toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Preview</CardTitle>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Print / PDF
            </Button>
          </CardHeader>
          <CardContent>
            <div ref={printRef} className="space-y-6 text-sm print:text-xs">
              {/* Header */}
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

              {/* Bill to */}
              <div>
                <p className="font-medium">Bill To:</p>
                <p>{clientName || 'Client Name'}</p>
                {clientAddress && <p className="text-muted-foreground">{clientAddress}</p>}
              </div>

              {selectedProject && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Project</p>
                  <p className="font-medium">{selectedProject.name}</p>
                </div>
              )}

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
                          <p className="font-medium">{day.role_name}</p>
                          <p className="text-muted-foreground capitalize">
                            {day.day_type.replace(/_/g, ' ')}
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
                <p className="text-muted-foreground text-center py-8">
                  {selectedProjectId ? 'Check the days you want to include on the left.' : 'Select a project to generate the invoice.'}
                </p>
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
