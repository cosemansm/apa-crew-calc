import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { FileText, FolderOpen, CheckSquare, Square, Download, Mail, Loader2, X, Send, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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

  const [projects, setProjects] = useState<Project[]>([]);
  const [allDays, setAllDays] = useState<ProjectDay[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${Date.now().toString(36).toUpperCase()}`);
  const [jobReference, setJobReference] = useState('');

  // From / To
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankSortCode, setBankSortCode] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

  const [clientEmail, setClientEmail] = useState('');

  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);

  // Email compose modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState('');

  const projectPickerRef = useRef<HTMLDivElement>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);

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
          const days = data as unknown as ProjectDay[];
          setAllDays(days);
          const preselect = (location.state as { dayId?: string } | null)?.dayId;
          if (preselect) {
            const preselectDay = days.find(d => d.id === preselect);
            if (preselectDay) {
              const projId = preselectDay.project_id;
              setSelectedProjectId(projId);
              setSelected(days.filter(d => d.project_id === projId).map(d => d.id));
              if (preselectDay.projects?.client_name) setClientName(preselectDay.projects.client_name);
            }
          }
        }
      });

    supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        if (data.company_name) setCompanyName(data.company_name);
        if (data.company_address) setCompanyAddress(data.company_address);
        if (data.vat_number) setVatNumber(data.vat_number);
        if (data.bank_account_name) setBankAccountName(data.bank_account_name);
        if (data.bank_sort_code) setBankSortCode(data.bank_sort_code);
        if (data.bank_account_number) setBankAccountNumber(data.bank_account_number);
      });
  }, [user]);

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
    setSelected(allDays.filter(d => d.project_id === proj.id).map(d => d.id));
    if (proj.client_name) setClientName(proj.client_name);
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const visibleDays = selectedProjectId ? allDays.filter(d => d.project_id === selectedProjectId) : allDays;
  const selectedDays = allDays.filter(d => selected.includes(d.id));
  const totalAmount = selectedDays.reduce((sum, d) => sum + (d.grand_total || 0), 0);
  const allVisibleSelected = visibleDays.length > 0 && visibleDays.every(d => selected.includes(d.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) setSelected(prev => prev.filter(id => !visibleDays.find(d => d.id === id)));
    else setSelected(prev => [...new Set([...prev, ...visibleDays.map(d => d.id)])]);
  };

  const generatePDF = async (): Promise<jsPDF | null> => {
    if (!invoiceRef.current) return null;
    const el = invoiceRef.current;

    // Temporarily force A4 width (794px ≈ 210mm at 96dpi) for capture,
    // then restore the original width so the preview stays responsive.
    const prevWidth = el.style.width;
    const prevPosition = el.style.position;
    el.style.width = '794px';

    const canvas = await html2canvas(el, {
      scale: 2,           // 2× for crisp hi-res output
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 794,
      windowWidth: 794,
    });

    el.style.width = prevWidth;
    el.style.position = prevPosition;

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfWidth = pdf.internal.pageSize.getWidth();   // 210mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

    // Scale image to fill A4 width exactly; add pages if content overflows
    const imgHeightMm = (canvas.height / canvas.width) * pdfWidth;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeightMm);
    let remaining = imgHeightMm - pdfHeight;
    while (remaining > 0) {
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -(imgHeightMm - remaining), pdfWidth, imgHeightMm);
      remaining -= pdfHeight;
    }

    return pdf;
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const pdf = await generatePDF();
      pdf?.save(`${invoiceNumber}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  const openEmailModal = () => {
    setEmailTo(clientEmail);
    setEmailSubject(`Invoice ${invoiceNumber} – ${selectedProject?.name || 'Services Rendered'}`);
    setEmailMessage(
      `Hi ${clientName || 'there'},\n\nPlease find attached invoice ${invoiceNumber} for ${selectedProject?.name || 'recent work'}.\n\nTotal amount due: £${totalAmount.toFixed(2)}\nPayment terms: 30 days from receipt.\n\nKind regards,\n${companyName || 'Your Name'}`
    );
    setEmailError('');
    setShowEmailModal(true);
  };

  const handleSendEmail = async () => {
    const toAddresses = emailTo.split(',').map(e => e.trim()).filter(Boolean);
    if (toAddresses.length === 0) {
      setEmailError('Please enter at least one email address.');
      return;
    }

    setEmailSending(true);
    setEmailError('');
    try {
      const pdf = await generatePDF();
      if (!pdf) {
        setEmailError('Failed to generate PDF. Please try again.');
        return;
      }

      // Convert to base64 (strip the data URI prefix)
      const pdfBase64 = pdf.output('datauristring').split(',')[1];

      const response = await fetch('/api/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toAddresses,
          subject: emailSubject,
          message: emailMessage,
          pdfBase64,
          fileName: `${invoiceNumber}.pdf`,
          fromName: companyName,
        }),
      });

      const result = await response.json() as { success?: boolean; error?: string };
      if (response.ok && result.success) {
        setShowEmailModal(false);
      } else {
        setEmailError(result.error || 'Failed to send email. Please try again.');
      }
    } catch (err) {
      setEmailError(`Unexpected error: ${String(err)}`);
    } finally {
      setEmailSending(false);
    }
  };

  const hasBankDetails = bankAccountName && bankSortCode && bankAccountNumber;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="h-6 w-6" />
        Invoice Generator
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── Left: Form ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
            <CardDescription>Select a project, then fill in your details</CardDescription>
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
                  <div className="absolute left-0 right-0 top-11 rounded-2xl border border-border bg-white shadow-xl z-50 overflow-hidden">
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
                                {proj.client_name && <p className="text-xs text-muted-foreground">{proj.client_name}</p>}
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

            {/* Invoice number / date / ref */}
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
            <div className="space-y-2">
              <Label>Job Reference <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={jobReference} onChange={e => setJobReference(e.target.value)} placeholder="e.g. PO-1234, Ref: ABC" />
            </div>

            <Separator />

            {/* From */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Your Name / Company</Label>
                {!companyName && <span className="text-xs text-amber-600">Add in Settings</span>}
              </div>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your Company Ltd" />
            </div>
            <div className="space-y-2">
              <Label>Your Address</Label>
              <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="123 Film Street, London" />
            </div>
            {vatNumber && (
              <div className="space-y-2">
                <Label>VAT Number</Label>
                <Input value={vatNumber} onChange={e => setVatNumber(e.target.value)} />
              </div>
            )}

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
            <div className="space-y-2">
              <Label>Client Email <span className="text-muted-foreground font-normal">(for sending invoice)</span></Label>
              <Input
                type="email"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                placeholder="finance@productioncо.com, producer@example.com"
              />
              <p className="text-xs text-muted-foreground">Separate multiple addresses with a comma</p>
            </div>

            <Separator />

            {/* Days */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Days to Invoice</Label>
                {visibleDays.length > 0 && (
                  <button onClick={toggleSelectAll} className="flex items-center gap-1 text-xs text-foreground font-medium hover:underline">
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

        {/* ── Right: Invoice Preview ──────────────────────────────────── */}
        <div className="space-y-3">
          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              className="flex-1 gap-2"
              onClick={handleDownload}
              disabled={downloading || sending || selectedDays.length === 0}
            >
              {downloading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                : <><Download className="h-4 w-4" /> Download PDF</>
              }
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={openEmailModal}
              disabled={downloading || emailSending || selectedDays.length === 0 || !clientEmail.trim()}
              title={!clientEmail.trim() ? 'Add a client email address in the form to enable sending' : undefined}
            >
              <Mail className="h-4 w-4" /> Send to Client
            </Button>
          </div>

          {selectedDays.length === 0 && (
            <p className="text-xs text-muted-foreground text-center">Select days on the left to enable download</p>
          )}
          {selectedDays.length > 0 && !clientEmail.trim() && (
            <p className="text-xs text-muted-foreground text-center">Add a client email address to enable sending</p>
          )}

          {/* Invoice document — responsive in preview, forced to 794px only during PDF export */}
          <div
            ref={invoiceRef}
            style={{ backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            className="rounded-2xl shadow-lg overflow-hidden"
          >
            {/* Top bar */}
            <div style={{ backgroundColor: '#1F1F21', padding: '28px 36px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <div style={{ backgroundColor: '#FFD528', borderRadius: '10px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                      ⚓
                    </div>
                    <span style={{ color: '#ffffff', fontWeight: '700', fontSize: '18px', letterSpacing: '-0.3px' }}>Crew Dock</span>
                  </div>
                  <p style={{ color: '#9A9A9A', fontSize: '12px', margin: '0' }}>APA Crew Rate Calculator</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ backgroundColor: '#FFD528', color: '#1F1F21', fontWeight: '800', fontSize: '22px', letterSpacing: '3px', padding: '6px 16px', borderRadius: '8px', display: 'inline-block' }}>
                    INVOICE
                  </div>
                  <p style={{ color: '#FFD528', fontWeight: '600', fontSize: '14px', margin: '8px 0 2px', fontFamily: 'monospace' }}>
                    #{invoiceNumber}
                  </p>
                  <p style={{ color: '#9A9A9A', fontSize: '12px', margin: '0' }}>
                    {format(new Date(), 'dd MMMM yyyy')}
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '32px 36px' }}>

              {/* From / To grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '28px' }}>
                <div>
                  <p style={{ fontSize: '10px', fontWeight: '700', color: '#9A9A9A', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>From</p>
                  <p style={{ fontWeight: '700', fontSize: '16px', color: '#1F1F21', margin: '0 0 4px' }}>{companyName || 'Your Company'}</p>
                  {companyAddress && (
                    <p style={{ color: '#6B6B6B', fontSize: '13px', margin: '0 0 4px', whiteSpace: 'pre-line' }}>{companyAddress}</p>
                  )}
                  {vatNumber && (
                    <p style={{ color: '#6B6B6B', fontSize: '12px', margin: '0' }}>VAT: {vatNumber}</p>
                  )}
                </div>
                <div>
                  <p style={{ fontSize: '10px', fontWeight: '700', color: '#9A9A9A', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>Bill To</p>
                  <p style={{ fontWeight: '700', fontSize: '16px', color: '#1F1F21', margin: '0 0 4px' }}>{clientName || 'Client Name'}</p>
                  {clientAddress && (
                    <p style={{ color: '#6B6B6B', fontSize: '13px', margin: '0', whiteSpace: 'pre-line' }}>{clientAddress}</p>
                  )}
                </div>
              </div>

              {/* Project / Job ref pills */}
              {(selectedProject || jobReference) && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
                  {selectedProject && (
                    <div style={{ backgroundColor: '#F5F3EE', borderRadius: '8px', padding: '8px 14px' }}>
                      <p style={{ fontSize: '10px', fontWeight: '700', color: '#9A9A9A', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 3px' }}>Project</p>
                      <p style={{ fontWeight: '600', fontSize: '13px', color: '#1F1F21', margin: '0' }}>{selectedProject.name}</p>
                    </div>
                  )}
                  {jobReference && (
                    <div style={{ backgroundColor: '#F5F3EE', borderRadius: '8px', padding: '8px 14px' }}>
                      <p style={{ fontSize: '10px', fontWeight: '700', color: '#9A9A9A', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 3px' }}>Job Reference</p>
                      <p style={{ fontWeight: '600', fontSize: '13px', color: '#1F1F21', margin: '0' }}>{jobReference}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Line items table */}
              {selectedDays.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F5F3EE' }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: '700', color: '#1F1F21', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', borderRadius: '6px 0 0 6px' }}>Description</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: '700', color: '#1F1F21', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: '700', color: '#1F1F21', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hours</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: '700', color: '#1F1F21', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', borderRadius: '0 6px 6px 0' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDays.map((day, idx) => (
                      <tr key={day.id} style={{ borderBottom: '1px solid #F0EDE8' }}>
                        <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                          <p style={{ fontWeight: '600', color: '#1F1F21', margin: '0 0 2px', fontSize: '13px' }}>{day.role_name}</p>
                          <p style={{ color: '#9A9A9A', margin: '0', fontSize: '11px', textTransform: 'capitalize' }}>
                            {day.day_type.replace(/_/g, ' ')}
                          </p>
                        </td>
                        <td style={{ padding: '12px 14px', color: '#6B6B6B', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          {day.work_date ? format(parseISO(day.work_date), 'EEE dd MMM yyyy') : '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#6B6B6B', verticalAlign: 'top', whiteSpace: 'nowrap', fontSize: '12px' }}>
                          {day.call_time} – {day.wrap_time}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: '700', color: '#1F1F21', verticalAlign: 'top', fontFamily: 'monospace', fontSize: '14px' }}>
                          £{(day.grand_total || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9A9A9A', fontSize: '14px' }}>
                  Select days from the left panel to populate the invoice.
                </div>
              )}

              {/* Total */}
              {selectedDays.length > 0 && (
                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ backgroundColor: '#1F1F21', borderRadius: '12px', padding: '16px 24px', minWidth: '220px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '24px' }}>
                      <span style={{ color: '#9A9A9A', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Total Due
                      </span>
                      <span style={{ color: '#FFD528', fontWeight: '800', fontSize: '22px', fontFamily: 'monospace' }}>
                        £{totalAmount.toFixed(2)}
                      </span>
                    </div>
                    <p style={{ color: '#6B6B6B', fontSize: '11px', margin: '6px 0 0', textAlign: 'right' }}>
                      Payment within 30 days of invoice
                    </p>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid #F0EDE8' }}>
                {hasBankDetails && (
                  <div style={{ backgroundColor: '#F5F3EE', borderRadius: '10px', padding: '14px 18px', marginBottom: '14px' }}>
                    <p style={{ fontSize: '10px', fontWeight: '700', color: '#9A9A9A', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>Payment Details</p>
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                      <div>
                        <p style={{ fontSize: '10px', color: '#9A9A9A', margin: '0 0 2px' }}>Account Name</p>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: '#1F1F21', margin: '0' }}>{bankAccountName}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '10px', color: '#9A9A9A', margin: '0 0 2px' }}>Sort Code</p>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: '#1F1F21', margin: '0', fontFamily: 'monospace' }}>{bankSortCode}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '10px', color: '#9A9A9A', margin: '0 0 2px' }}>Account Number</p>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: '#1F1F21', margin: '0', fontFamily: 'monospace' }}>{bankAccountNumber}</p>
                      </div>
                    </div>
                  </div>
                )}
                <p style={{ color: '#ABABAB', fontSize: '11px', margin: '0 0 4px' }}>
                  Rates as per APA Recommended Terms for Engaging Crew on Commercials (Effective 1 September 2025)
                </p>
                <p style={{ color: '#ABABAB', fontSize: '11px', margin: '0' }}>
                  Generated by Crew Dock · crewdock.app
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Email Compose Modal ──────────────────────────────────── */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-base">Send Invoice to Client</h2>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="rounded-lg p-1.5 hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-2">
                <Label>To</Label>
                <Input
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  placeholder="client@example.com, finance@example.com"
                />
                <p className="text-xs text-muted-foreground">Separate multiple addresses with a comma</p>
              </div>

              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={emailMessage}
                  onChange={e => setEmailMessage(e.target.value)}
                  rows={7}
                  className="resize-none text-sm"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span>The invoice PDF (<strong>{invoiceNumber}.pdf</strong>) will be attached automatically.</span>
              </div>

              {emailError && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{emailError}</span>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" className="flex-1" onClick={() => setShowEmailModal(false)} disabled={emailSending}>
                Cancel
              </Button>
              <Button className="flex-1 gap-2" onClick={handleSendEmail} disabled={emailSending}>
                {emailSending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : <><Send className="h-4 w-4" /> Send Invoice</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
