import { useEffect, useState, useRef } from 'react';
import * as Sentry from '@sentry/react';
import logoImg from '@/assets/logo.png';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { format, parseISO } from 'date-fns';
import { FileText, FolderOpen, Download, Mail, Loader2, X, Send, AlertCircle, Lock } from 'lucide-react';
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
import { useSubscription } from '@/contexts/SubscriptionContext';
import { exportToFreeAgent, isFreeAgentConnected, FreeAgentAuthError } from '@/services/bookkeeping/freeagent';
import { exportToXero, isXeroConnected, XeroAuthError } from '@/services/bookkeeping/xero';
import { exportToQBO, isQBOConnected, QBOAuthError } from '@/services/bookkeeping/quickbooks';
import { BookkeepingCTA } from '@/components/BookkeepingCTA';
import { TimesheetDocument } from '@/components/TimesheetDocument';
import type { TimesheetDay } from '@/components/TimesheetDocument';

const QBO_MESSAGES = ['Connecting to QuickBooks…', 'Preparing export…', 'Creating invoice…'];

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  job_reference: string | null;
}

interface DayResultJson {
  lineItems?: { description: string; hours?: number; rate?: number; total: number; timeFrom?: string; timeTo?: string }[];
  penalties?: { description: string; hours?: number; rate?: number; total: number }[];
  travelPay?: number;
  mileage?: number;
  mileageMiles?: number;
  equipmentTotal?: number;
  equipmentDiscount?: number;
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
  result_json?: DayResultJson;
  expenses_amount?: number;
  expenses_notes?: string;
  projects: { name: string; client_name: string | null } | null;
}

export function InvoicePage() {
  usePageTitle('Invoices');
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

  const detailedInvoice = true;

  const [vatRegistered, setVatRegistered] = useState(false);

  const [faConnected, setFaConnected] = useState<boolean | null>(null);
  const [faDetailed, setFaDetailed] = useState(true);
  const [exportingFa, setExportingFa] = useState(false);
  const [faExportUrl, setFaExportUrl] = useState<string | null>(null);
  const [faExportError, setFaExportError] = useState<string | null>(null);

  const [xeroConnected, setXeroConnected] = useState<boolean | null>(null);
  const [xeroDetailed, setXeroDetailed] = useState(true);
  const [exportingXero, setExportingXero] = useState(false);
  const [xeroExportUrl, setXeroExportUrl] = useState<string | null>(null);
  const [xeroExportError, setXeroExportError] = useState<string | null>(null);

  const [qboConnected, setQboConnected] = useState<boolean | null>(null);
  const [qboDetailed, setQboDetailed] = useState(true);
  const [exportingQbo, setExportingQbo] = useState(false);
  const [qboExportUrl, setQboExportUrl] = useState<string | null>(null);
  const [qboExportError, setQboExportError] = useState<string | null>(null);
  const [qboLoadingMessage, setQboLoadingMessage] = useState(QBO_MESSAGES[0]);

  const { isPremium } = useSubscription();
  const navigate = useNavigate();

  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);

  // Email compose modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const projectPickerRef = useRef<HTMLDivElement>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const timesheetRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'timesheet' | 'invoice'>('timesheet');

  useEffect(() => {
    if (!user) return;

    supabase
      .from('projects')
      .select('id, name, client_name, job_reference')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) Sentry.captureException(error, { extra: { context: 'InvoicePage projects fetch' } });
        if (data) setProjects(data);
      });

    supabase
      .from('project_days')
      .select('id, project_id, work_date, role_name, day_type, call_time, wrap_time, grand_total, result_json, expenses_amount, expenses_notes, projects(name, client_name)')
      .order('work_date', { ascending: true })
      .then(({ data, error }) => {
        if (error) Sentry.captureException(error, { extra: { context: 'InvoicePage project_days fetch' } });
        if (data) {
          const days = data as unknown as ProjectDay[];
          setAllDays(days);
          const state = location.state as { dayId?: string; projectId?: string } | null;
          const preselectProjectId = state?.projectId;
          const preselectDayId = state?.dayId;
          if (preselectProjectId) {
            const projDays = days.filter(d => d.project_id === preselectProjectId);
            if (projDays.length > 0) {
              setSelectedProjectId(preselectProjectId);
              setSelected(projDays.map(d => d.id));
              if (projDays[0].projects?.client_name) setClientName(projDays[0].projects.client_name);
            }
          } else if (preselectDayId) {
            const preselectDay = days.find(d => d.id === preselectDayId);
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
      .then(({ data, error }) => {
        if (error && error.code !== 'PGRST116') Sentry.captureException(error, { extra: { context: 'InvoicePage user_settings fetch' } });
        if (!data) return;
        if (data.company_name) setCompanyName(data.company_name);
        if (data.company_address) setCompanyAddress(data.company_address);
        if (data.vat_number) setVatNumber(data.vat_number);
        if (data.bank_account_name) setBankAccountName(data.bank_account_name);
        if (data.bank_sort_code) setBankSortCode(data.bank_sort_code);
        if (data.bank_account_number) setBankAccountNumber(data.bank_account_number);
        setVatRegistered(data.vat_registered ?? false);
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

  useEffect(() => {
    if (!user) return;
    isFreeAgentConnected(user.id).then(setFaConnected).catch(() => setFaConnected(false));
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    isXeroConnected(user.id).then(setXeroConnected).catch(() => setXeroConnected(false));
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    isQBOConnected(user.id).then(setQboConnected).catch(() => setQboConnected(false));
  }, [user?.id]);

  const handleExportToFreeAgent = async () => {
    if (!user || selectedDays.length === 0) return;
    if (!clientName.trim()) { setFaExportError('Please add a client name before sending to FreeAgent.'); return; }
    setExportingFa(true);
    setFaExportUrl(null);
    setFaExportError(null);
    try {
      const { invoiceUrl } = await exportToFreeAgent(user.id, {
        clientName,
        projectName: selectedProject?.name ?? '',
        jobReference: jobReference.trim() || null,
        invoiceNumber,
        days: selectedDays,
        vatRegistered,
        detailed: faDetailed,
      });
      setFaExportUrl(invoiceUrl);
      window.open(invoiceUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if (err instanceof FreeAgentAuthError) {
        setFaConnected(false);
        setFaExportError('reconnect');
      } else {
        setFaExportError(err instanceof Error ? err.message : 'Failed to export to FreeAgent');
      }
    } finally {
      setExportingFa(false);
    }
  };

  const handleExportToXero = async () => {
    if (!user || selectedDays.length === 0) return;
    if (!clientName.trim()) { setXeroExportError('Please add a client name before sending to Xero.'); return; }
    setExportingXero(true);
    setXeroExportUrl(null);
    setXeroExportError(null);
    try {
      const { invoiceUrl } = await exportToXero(user.id, {
        clientName,
        projectName: selectedProject?.name ?? '',
        jobReference: jobReference.trim() || null,
        invoiceNumber,
        days: selectedDays,
        vatRegistered,
        detailed: xeroDetailed,
      });
      setXeroExportUrl(invoiceUrl);
      window.open(invoiceUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if (err instanceof XeroAuthError) {
        setXeroConnected(false);
        setXeroExportError('reconnect');
      } else {
        setXeroExportError(err instanceof Error ? err.message : 'Failed to export to Xero');
      }
    } finally {
      setExportingXero(false);
    }
  };

  const handleExportToQBO = async () => {
    if (!user || selectedDays.length === 0) return;
    if (!clientName.trim()) { setQboExportError('Please add a client name before sending to QuickBooks.'); return; }
    setExportingQbo(true);
    setQboExportUrl(null);
    setQboExportError(null);
    setQboLoadingMessage(QBO_MESSAGES[0]);

    const t1 = setTimeout(() => setQboLoadingMessage(QBO_MESSAGES[1]), 1500);
    const t2 = setTimeout(() => setQboLoadingMessage(QBO_MESSAGES[2]), 4000);

    try {
      const { invoiceUrl } = await exportToQBO(user.id, {
        clientName,
        projectName: selectedProject?.name ?? '',
        jobReference: jobReference.trim() || null,
        invoiceNumber,
        days: selectedDays,
        vatRegistered,
        detailed: qboDetailed,
      });
      setQboExportUrl(invoiceUrl);
      window.open(invoiceUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if (err instanceof QBOAuthError) {
        setQboConnected(false);
        setQboExportError('reconnect');
      } else {
        setQboExportError(err instanceof Error ? err.message : 'Failed to export to QuickBooks');
      }
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setExportingQbo(false);
    }
  };

  const handleSelectProject = (proj: Project) => {
    setSelectedProjectId(proj.id);
    setShowProjectPicker(false);
    setSelected(allDays.filter(d => d.project_id === proj.id).map(d => d.id));
    if (proj.client_name) setClientName(proj.client_name);
    setJobReference(proj.job_reference ?? '');
    setFaExportUrl(null);
    setFaExportError(null);
    setXeroExportUrl(null);
    setXeroExportError(null);
    setQboExportUrl(null);
    setQboExportError(null);
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const selectedDays = allDays.filter(d => selected.includes(d.id));
  const totalAmount = selectedDays.reduce((sum, d) => sum + (d.grand_total || 0), 0);
  const vatAmount = vatNumber ? totalAmount * 0.2 : 0;
  const totalWithVat = totalAmount + vatAmount;

  // Shared helper — captures the invoice element and builds a jsPDF.
  // scale:2 + PNG for crisp downloads; scale:1 + JPEG for smaller email attachments.
  const capturePDF = async (scale: number, format: 'PNG' | 'JPEG'): Promise<jsPDF | null> => {
    if (!invoiceRef.current) return null;
    const el = invoiceRef.current;

    // Temporarily strip rounded corners + shadow so they don't bleed grey into the PDF
    const prevWidth        = el.style.width;
    const prevBorderRadius = el.style.borderRadius;
    const prevBoxShadow    = el.style.boxShadow;
    el.style.width        = '794px';
    el.style.borderRadius = '0';
    el.style.boxShadow    = 'none';

    const canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: 794,
      windowWidth: 794,
    });

    el.style.width        = prevWidth;
    el.style.borderRadius = prevBorderRadius;
    el.style.boxShadow    = prevBoxShadow;

    const mimeType = format === 'JPEG' ? 'image/jpeg' : 'image/png';
    const quality  = format === 'JPEG' ? 0.85 : 1;
    const imgData  = canvas.toDataURL(mimeType, quality);

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfWidth  = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgHeightMm = (canvas.height / canvas.width) * pdfWidth;

    pdf.addImage(imgData, format, 0, 0, pdfWidth, imgHeightMm);
    let remaining = imgHeightMm - pdfHeight;
    while (remaining > 0) {
      pdf.addPage();
      pdf.addImage(imgData, format, 0, -(imgHeightMm - remaining), pdfWidth, imgHeightMm);
      remaining -= pdfHeight;
    }

    return pdf;
  };

  // High-res PNG for downloading (looks sharp when printed)
  const generatePDF = () => capturePDF(2, 'PNG');

  // Smaller JPEG for email attachment (keeps payload well under Vercel's limit)
  const generatePDFForEmail = () => capturePDF(1, 'JPEG');

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const pdf = await generatePDF();
      pdf?.save(`${invoiceNumber}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  const handleTimesheetDownload = async () => {
    if (!timesheetRef.current) return;
    setDownloading(true);
    try {
      const el = timesheetRef.current;
      const prevWidth        = el.style.width;
      const prevBorderRadius = el.style.borderRadius;
      const prevBoxShadow    = el.style.boxShadow;

      el.style.width        = '794px';
      el.style.borderRadius = '0';
      el.style.boxShadow    = 'none';

      try {
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
        });

        const imgData     = canvas.toDataURL('image/png', 1);
        const pdf         = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pdfWidth    = pdf.internal.pageSize.getWidth();
        const imgHeightMm = (canvas.height / canvas.width) * pdfWidth;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeightMm);

        const slug    = (selectedProject?.name ?? 'timesheet').toLowerCase().replace(/\s+/g, '-');
        const dateStr = format(new Date(), 'yyyy-MM-dd');
        pdf.save(`timesheet-${slug}-${dateStr}.pdf`);
      } finally {
        el.style.width        = prevWidth;
        el.style.borderRadius = prevBorderRadius;
        el.style.boxShadow    = prevBoxShadow;
      }
    } finally {
      setDownloading(false);
    }
  };

  const openEmailModal = () => {
    if (!isPremium) {
      navigate('/#pricing');
      return;
    }
    setEmailTo(clientEmail);
    setEmailSubject(`Invoice ${invoiceNumber} – ${selectedProject?.name || 'Services Rendered'}`);
    setEmailMessage(
      `Hi ${clientName || 'there'},\n\nPlease find attached invoice ${invoiceNumber} for ${selectedProject?.name || 'recent work'}.\n\nTotal amount due: £${(vatNumber ? totalWithVat : totalAmount).toFixed(2)}${vatNumber ? ' (inc. VAT)' : ''}\nPayment terms: 30 days from receipt.\n\nKind regards,\n${companyName || 'Your Name'}`
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
      const pdf = await generatePDFForEmail();
      if (!pdf) {
        setEmailError('Failed to generate PDF. Please try again.');
        return;
      }

      // Convert PDF to base64 via ArrayBuffer (reliable cross-browser)
      const pdfArrayBuffer = pdf.output('arraybuffer');
      const uint8Array = new Uint8Array(pdfArrayBuffer);
      let binary = '';
      uint8Array.forEach(byte => { binary += String.fromCharCode(byte); });
      const pdfBase64 = btoa(binary);

      const response = await fetch('/api/email/send-invoice', {
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

      // Read response text first so we can show a useful error if it's not JSON
      const responseText = await response.text();
      let result: { success?: boolean; error?: string };
      try {
        result = JSON.parse(responseText);
      } catch {
        result = { error: `Server error (${response.status}): ${responseText.slice(0, 300)}` };
      }

      if (response.ok && result.success) {
        setShowEmailModal(false);
        setEmailSent(true);
        // Auto-promote job status → invoiced
        if (selectedProjectId) {
          await supabase
            .from('projects')
            .update({ status: 'invoiced' })
            .eq('id', selectedProjectId)
            .neq('status', 'invoiced'); // no-op if already invoiced
        }
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

      {/* ── Tab toggle ── */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('timesheet')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'timesheet'
              ? 'bg-[#FFD528] text-[#1F1F21]'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          Timesheet
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('invoice')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
            activeTab === 'invoice'
              ? 'bg-[#FFD528] text-[#1F1F21]'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          Invoice
          {!isPremium && <Lock className="h-3 w-3" />}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── Left: Form ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
            <CardDescription>Select a job, then fill in your details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Project selector */}
            <div className="space-y-2">
              <Label>Job</Label>
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
                      <span className="text-muted-foreground">Select a job…</span>
                    )}
                  </div>
                  {selectedProject && (
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {selectedDays.length} day{selectedDays.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </button>

                {showProjectPicker && (
                  <div className="absolute left-0 right-0 top-11 rounded-2xl border border-border bg-white shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border/40">
                      <p className="text-xs font-semibold text-muted-foreground">Choose job to invoice</p>
                    </div>
                    {projects.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-muted-foreground text-center">No jobs yet</div>
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
                <Input
                  value={invoiceNumber}
                  onChange={e => setInvoiceNumber(e.target.value)}
                  disabled={!!faConnected || !!xeroConnected || !!qboConnected}
                  title={faConnected ? 'FreeAgent will assign its own invoice number' : xeroConnected ? 'Xero will assign its own invoice number' : qboConnected ? 'QuickBooks will assign its own invoice number' : undefined}
                />
                {(faConnected || xeroConnected || qboConnected) && (
                  <p className="text-xs text-muted-foreground">
                    {faConnected ? 'FreeAgent' : xeroConnected ? 'Xero' : 'QuickBooks'} assigns its own number
                  </p>
                )}
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

            {/* To — client details first */}
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
                placeholder="finance@production.com, producer@example.com"
              />
              <p className="text-xs text-muted-foreground">Separate multiple addresses with a comma</p>
            </div>

            <Separator />

            {/* From — your details (read-only) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Your Details</Label>
                <a href="/settings" className="text-xs text-[#FFD528] underline">Edit your details →</a>
              </div>
              {companyName
                ? <p className="text-sm font-medium text-foreground">{companyName}</p>
                : <p className="text-sm text-amber-600">Company name not set — add it in Settings</p>
              }
              {companyAddress && <p className="text-sm text-muted-foreground">{companyAddress}</p>}
              {vatNumber && <p className="text-sm text-muted-foreground">VAT: {vatNumber}</p>}
            </div>

          </CardContent>
        </Card>

        {/* ── Right: Timesheet / Invoice Preview ──────────────────────── */}
        {activeTab === 'timesheet' ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              className="flex-1 gap-2 bg-[#FFD528] text-[#1F1F21] hover:bg-[#FFD528]/90"
              onClick={handleTimesheetDownload}
              disabled={downloading || selectedDays.length === 0}
            >
              {downloading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                : <><Download className="h-4 w-4" /> Download PDF</>
              }
            </Button>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => setActiveTab('invoice')}
            >
              Invoice {!isPremium && <Lock className="h-3 w-3" />}
            </Button>
          </div>
          <div
            ref={timesheetRef}
            className="rounded-2xl shadow-lg overflow-hidden"
          >
            <TimesheetDocument
              userName={companyName || user?.email || ''}
              projectName={selectedProject?.name ?? ''}
              clientName={selectedProject?.client_name ?? null}
              selectedDays={selectedDays as TimesheetDay[]}
            />
          </div>
        </div>
        ) : (
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
              disabled={downloading || emailSending || selectedDays.length === 0 || (!isPremium ? false : !clientEmail.trim())}
              title={!isPremium ? 'Upgrade to Pro to send invoices by email' : (!clientEmail.trim() ? 'Add a client email address in the form to enable sending' : undefined)}
            >
              {isPremium ? <Mail className="h-4 w-4" /> : <Lock className="h-4 w-4" />} Send to Client
            </Button>
          </div>

          {/* FreeAgent export — only shown when connected and Pro */}
          {isPremium && faConnected && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Line items</span>
                <div className="flex rounded-md border border-border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setFaDetailed(false)}
                    className={cn(
                      'px-3 py-1 transition-colors',
                      !faDetailed ? 'bg-[#FFD528] text-[#1F1F21] font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Basic
                  </button>
                  <button
                    type="button"
                    onClick={() => setFaDetailed(true)}
                    className={cn(
                      'px-3 py-1 transition-colors',
                      faDetailed ? 'bg-[#FFD528] text-[#1F1F21] font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Detailed
                  </button>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleExportToFreeAgent}
                disabled={exportingFa || selectedDays.length === 0}
              >
                {exportingFa
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending to FreeAgent…</>
                  : 'Send to FreeAgent'
                }
              </Button>
            </div>
          )}

          {/* FreeAgent export result */}
          {faExportUrl && (
            <p className="text-xs text-center">
              <a href={faExportUrl} target="_blank" rel="noopener noreferrer" className="text-[#FFD528] underline">
                View draft invoice in FreeAgent →
              </a>
            </p>
          )}
          {faExportError && (
            faExportError === 'reconnect' ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-center">
                <p className="text-xs text-red-400 font-medium">Please reconnect FreeAgent</p>
                <a href="/settings#bookkeeping" className="text-xs text-[#FFD528] underline">
                  Go to Settings →
                </a>
              </div>
            ) : (
              <p className="text-xs text-red-500 text-center">{faExportError}</p>
            )
          )}

          {selectedDays.length === 0 && (
            <p className="text-xs text-muted-foreground text-center">Select a job to enable download</p>
          )}
          {selectedDays.length > 0 && !clientEmail.trim() && (
            <p className="text-xs text-muted-foreground text-center">Add a client email address to enable sending</p>
          )}

          {/* Xero export — only shown when connected and Pro */}
          {isPremium && xeroConnected && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Line items</span>
                <div className="flex rounded-md border border-border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setXeroDetailed(false)}
                    className={cn(
                      'px-3 py-1 transition-colors',
                      !xeroDetailed ? 'bg-[#FFD528] text-[#1F1F21] font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Basic
                  </button>
                  <button
                    type="button"
                    onClick={() => setXeroDetailed(true)}
                    className={cn(
                      'px-3 py-1 transition-colors',
                      xeroDetailed ? 'bg-[#FFD528] text-[#1F1F21] font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Detailed
                  </button>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleExportToXero}
                disabled={exportingXero || selectedDays.length === 0}
              >
                {exportingXero
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending to Xero…</>
                  : 'Send to Xero'
                }
              </Button>
            </div>
          )}

          {/* Xero export result */}
          {xeroExportUrl && (
            <p className="text-xs text-center">
              <a href={xeroExportUrl} target="_blank" rel="noopener noreferrer" className="text-[#FFD528] underline">
                View draft invoice in Xero →
              </a>
            </p>
          )}
          {xeroExportError && (
            xeroExportError === 'reconnect' ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-center">
                <p className="text-xs text-red-400 font-medium">Please reconnect Xero</p>
                <a href="/settings#bookkeeping" className="text-xs text-[#FFD528] underline">
                  Go to Settings →
                </a>
              </div>
            ) : (
              <p className="text-xs text-red-500 text-center">{xeroExportError}</p>
            )
          )}

          {/* QBO export — only shown when connected and Pro */}
          {isPremium && qboConnected && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Line items</span>
                <div className="flex rounded-md border border-border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setQboDetailed(false)}
                    className={cn(
                      'px-3 py-1 transition-colors',
                      !qboDetailed ? 'bg-[#FFD528] text-[#1F1F21] font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Basic
                  </button>
                  <button
                    type="button"
                    onClick={() => setQboDetailed(true)}
                    className={cn(
                      'px-3 py-1 transition-colors',
                      qboDetailed ? 'bg-[#FFD528] text-[#1F1F21] font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Detailed
                  </button>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleExportToQBO}
                disabled={exportingQbo || selectedDays.length === 0}
              >
                {exportingQbo
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {qboLoadingMessage}</>
                  : 'Send to QuickBooks'
                }
              </Button>
            </div>
          )}

          {/* QBO export result */}
          {qboExportUrl && (
            <p className="text-xs text-center">
              <a href={qboExportUrl} target="_blank" rel="noopener noreferrer" className="text-[#FFD528] underline">
                View invoice in QuickBooks →
              </a>
            </p>
          )}
          {qboExportError && (
            qboExportError === 'reconnect' ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-center">
                <p className="text-xs text-red-400 font-medium">Please reconnect QuickBooks</p>
                <a href="/settings#bookkeeping" className="text-xs text-[#FFD528] underline">
                  Go to Settings →
                </a>
              </div>
            ) : (
              <p className="text-xs text-red-500 text-center">{qboExportError}</p>
            )
          )}

          {/* BookkeepingCTA — shown when no bookkeeping platform is connected */}
          {user && faConnected === false && xeroConnected === false && qboConnected === false && (
            <BookkeepingCTA userId={user.id} />
          )}

          {/* Invoice document — responsive in preview, forced to 794px only during PDF export */}
          <div
            ref={invoiceRef}
            style={{ backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            className="rounded-2xl shadow-lg overflow-hidden"
          >
            {/* Top bar */}
            <div style={{ backgroundColor: '#1F1F21', padding: '28px 36px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* Left: logo + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    backgroundColor: '#FFD528', borderRadius: '10px',
                    width: '44px', height: '44px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <img src={logoImg} alt="Crew Dock" style={{ width: '28px', height: '28px', objectFit: 'contain', display: 'block' }} />
                  </div>
                  <div>
                    <div style={{ color: '#ffffff', fontWeight: '700', fontSize: '18px', letterSpacing: '-0.3px', lineHeight: '1.2' }}>Crew Dock</div>
                    <div style={{ color: '#9A9A9A', fontSize: '11px', lineHeight: '1.2', marginTop: '2px' }}>APA Crew Rate Calculator</div>
                  </div>
                </div>
                {/* Right: INVOICE badge + number + date */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                  <div style={{
                    backgroundColor: '#FFD528', color: '#1F1F21',
                    fontWeight: '800', fontSize: '18px', letterSpacing: '3px',
                    padding: '10px 24px', borderRadius: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    INVOICE
                  </div>
                  <div style={{ color: '#FFD528', fontWeight: '600', fontSize: '13px', fontFamily: 'monospace' }}>
                    #{invoiceNumber}
                  </div>
                  <div style={{ color: '#9A9A9A', fontSize: '11px' }}>
                    {format(new Date(), 'dd MMMM yyyy')}
                  </div>
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
                <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', flexWrap: 'wrap', alignItems: 'stretch' }}>
                  {selectedProject && (
                    <div style={{ backgroundColor: '#F5F3EE', borderRadius: '8px', padding: '8px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '9px', fontWeight: '700', color: '#ABABAB', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Job</div>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: '#1F1F21' }}>{selectedProject.name}</div>
                    </div>
                  )}
                  {jobReference && (
                    <div style={{ backgroundColor: '#F5F3EE', borderRadius: '8px', padding: '8px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '9px', fontWeight: '700', color: '#ABABAB', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px' }}>Ref</div>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: '#1F1F21' }}>{jobReference}</div>
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
                    {selectedDays.map((day) => {
                      const rj = day.result_json;
                      const hasBreakdown = detailedInvoice && rj && (
                        (rj.lineItems?.length ?? 0) > 0 ||
                        (rj.penalties?.length ?? 0) > 0 ||
                        (rj.travelPay ?? 0) > 0 ||
                        (rj.mileage ?? 0) > 0 ||
                        (rj.equipmentTotal ?? 0) > 0 ||
                        (day.expenses_amount ?? 0) > 0
                      );
                      return (
                        <>
                          {/* Main day row */}
                          <tr key={day.id} style={{ borderBottom: hasBreakdown ? 'none' : '1px solid #F0EDE8' }}>
                            <td style={{ padding: hasBreakdown ? '12px 14px 4px' : '12px 14px', verticalAlign: 'top' }}>
                              <p style={{ fontWeight: '600', color: '#1F1F21', margin: '0 0 2px', fontSize: '13px' }}>{day.role_name}</p>
                              <p style={{ color: '#9A9A9A', margin: '0', fontSize: '11px', textTransform: 'capitalize' }}>
                                {day.day_type.replace(/_/g, ' ')}
                              </p>
                            </td>
                            <td style={{ padding: hasBreakdown ? '12px 14px 4px' : '12px 14px', color: '#6B6B6B', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                              {day.work_date ? format(parseISO(day.work_date), 'EEE dd MMM yyyy') : '—'}
                            </td>
                            <td style={{ padding: hasBreakdown ? '12px 14px 4px' : '12px 14px', color: '#6B6B6B', verticalAlign: 'top', whiteSpace: 'nowrap', fontSize: '12px' }}>
                              {day.call_time} – {day.wrap_time}
                            </td>
                            <td style={{ padding: hasBreakdown ? '12px 14px 4px' : '12px 14px', textAlign: 'right', fontWeight: '700', color: '#1F1F21', verticalAlign: 'top', fontFamily: 'monospace', fontSize: '14px' }}>
                              £{(day.grand_total || 0).toFixed(2)}
                            </td>
                          </tr>

                          {/* Detailed sub-rows */}
                          {hasBreakdown && rj && (
                            <>
                              {/* Line items (base rate, OT, etc.) */}
                              {rj.lineItems?.map((item, i) => (
                                <tr key={`li-${i}`} style={{ backgroundColor: '#FAFAF8' }}>
                                  <td style={{ padding: '3px 14px 3px 28px', color: '#6B6B6B', fontSize: '11px' }}>
                                    {item.description}
                                  </td>
                                  <td style={{ padding: '3px 14px', color: '#9A9A9A', fontSize: '11px', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                                    {item.timeFrom && item.timeTo ? `${item.timeFrom}–${item.timeTo}` : ''}
                                  </td>
                                  <td style={{ padding: '3px 14px', color: '#9A9A9A', fontSize: '11px', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                                    {item.rate && item.hours ? `£${item.rate.toFixed(0)} × ${Math.abs(item.rate - item.total) < 1 ? '1' : item.hours % 1 === 0 ? `${item.hours}h` : `${item.hours.toFixed(2)}h`}` : ''}
                                  </td>
                                  <td style={{ padding: '3px 14px', textAlign: 'right', color: '#6B6B6B', fontSize: '11px', fontFamily: 'monospace' }}>
                                    £{item.total.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                              {/* Penalties */}
                              {rj.penalties?.map((p, i) => (
                                <tr key={`pen-${i}`} style={{ backgroundColor: '#FAFAF8' }}>
                                  <td style={{ padding: '3px 14px 3px 28px', color: '#6B6B6B', fontSize: '11px' }} colSpan={2}>
                                    {p.description}
                                  </td>
                                  <td style={{ padding: '3px 14px', color: '#9A9A9A', fontSize: '11px', fontFamily: 'monospace' }}>
                                    {p.rate && p.hours && p.hours > 0 ? `£${p.rate.toFixed(0)} × ${p.hours.toFixed(2)}h` : ''}
                                  </td>
                                  <td style={{ padding: '3px 14px', textAlign: 'right', color: '#6B6B6B', fontSize: '11px', fontFamily: 'monospace' }}>
                                    £{p.total.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                              {/* Travel pay */}
                              {(rj.travelPay ?? 0) > 0 && (
                                <tr style={{ backgroundColor: '#FAFAF8' }}>
                                  <td style={{ padding: '3px 14px 3px 28px', color: '#6B6B6B', fontSize: '11px' }} colSpan={3}>
                                    Travel pay{rj.mileageMiles ? ` · ${rj.mileageMiles} miles outside M25` : ''}
                                  </td>
                                  <td style={{ padding: '3px 14px', textAlign: 'right', color: '#6B6B6B', fontSize: '11px', fontFamily: 'monospace' }}>
                                    £{((rj.travelPay ?? 0) + (rj.mileage ?? 0)).toFixed(2)}
                                  </td>
                                </tr>
                              )}
                              {/* Equipment */}
                              {(rj.equipmentTotal ?? 0) > 0 && (
                                <tr style={{ backgroundColor: '#FAFAF8' }}>
                                  <td style={{ padding: '3px 14px 3px 28px', color: '#6B6B6B', fontSize: '11px' }} colSpan={3}>
                                    Equipment{(rj.equipmentDiscount ?? 0) > 0 ? ` (−${rj.equipmentDiscount}% discount)` : ''}
                                  </td>
                                  <td style={{ padding: '3px 14px', textAlign: 'right', color: '#6B6B6B', fontSize: '11px', fontFamily: 'monospace' }}>
                                    £{(rj.equipmentTotal ?? 0).toFixed(2)}
                                  </td>
                                </tr>
                              )}
                              {/* Expenses */}
                              {(day.expenses_amount ?? 0) > 0 && (
                                <tr style={{ backgroundColor: '#FAFAF8' }}>
                                  <td style={{ padding: '3px 14px 8px 28px', color: '#6B6B6B', fontSize: '11px', borderBottom: '1px solid #F0EDE8' }} colSpan={3}>
                                    Expenses{day.expenses_notes ? ` — ${day.expenses_notes}` : ''}
                                  </td>
                                  <td style={{ padding: '3px 14px 8px', textAlign: 'right', color: '#6B6B6B', fontSize: '11px', fontFamily: 'monospace', borderBottom: '1px solid #F0EDE8' }}>
                                    £{(day.expenses_amount ?? 0).toFixed(2)}
                                  </td>
                                </tr>
                              )}
                              {/* Closing border row if no expenses */}
                              {(day.expenses_amount ?? 0) === 0 && (
                                <tr style={{ borderBottom: '1px solid #F0EDE8' }}>
                                  <td colSpan={4} style={{ padding: '4px 0' }}></td>
                                </tr>
                              )}
                            </>
                          )}
                        </>
                      );
                    })}
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
                  <div style={{ backgroundColor: '#1F1F21', borderRadius: '12px', padding: '16px 28px', minWidth: '240px', textAlign: 'center' }}>
                    {vatNumber ? (
                      <>
                        <p style={{ color: '#9A9A9A', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>
                          Summary
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: '#9A9A9A', fontSize: '12px' }}>Subtotal (ex. VAT)</span>
                          <span style={{ color: '#FFFFFF', fontSize: '12px', fontFamily: 'monospace' }}>£{totalAmount.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                          <span style={{ color: '#9A9A9A', fontSize: '12px' }}>VAT (20%)</span>
                          <span style={{ color: '#FFFFFF', fontSize: '12px', fontFamily: 'monospace' }}>£{vatAmount.toFixed(2)}</span>
                        </div>
                        <div style={{ borderTop: '1px solid #3A3A3C', paddingTop: '10px', marginBottom: '6px' }}>
                          <p style={{ color: '#9A9A9A', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>
                            Total Due (inc. VAT)
                          </p>
                          <p style={{ color: '#FFD528', fontWeight: '800', fontSize: '26px', fontFamily: 'monospace', margin: '0' }}>
                            £{totalWithVat.toFixed(2)}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <p style={{ color: '#9A9A9A', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>
                          Total Due
                        </p>
                        <p style={{ color: '#FFD528', fontWeight: '800', fontSize: '26px', fontFamily: 'monospace', margin: '0 0 6px' }}>
                          £{totalAmount.toFixed(2)}
                        </p>
                      </>
                    )}
                    <p style={{ color: '#6B6B6B', fontSize: '11px', margin: vatNumber ? '6px 0 0' : '0' }}>
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
        )}
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

      {/* ── Sent Confirmation ────────────────────────────────────── */}
      {emailSent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm text-center px-8 py-10">
            <div className="mx-auto mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Invoice Sent!</h2>
            <p className="text-sm text-muted-foreground mb-1">
              Your invoice has been delivered to:
            </p>
            <p className="text-sm font-medium text-gray-800 mb-6 break-all">{emailTo}</p>
            <Button className="w-full" onClick={() => setEmailSent(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
