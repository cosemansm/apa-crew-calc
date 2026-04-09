import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  LifeBuoy, MessageSquare, Lightbulb, BookOpen, Send, ChevronUp, ChevronRight,
  Calculator, FolderOpen, FileText, Sparkles, Settings, Package, Receipt,
  LayoutDashboard, History, Briefcase, CalendarDays, Clock, Coffee, Car, Shield,
} from 'lucide-react';
import helpDashboard from '@/assets/help/dashboard.svg';
import helpCalculator from '@/assets/help/calculator.svg';
import helpJobs from '@/assets/help/jobs.svg';
import helpInvoices from '@/assets/help/invoices.svg';
import helpAiInput from '@/assets/help/ai-input.svg';
import helpSettings from '@/assets/help/settings.svg';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeatureRequest {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  description: string;
  status: 'requested' | 'planned' | 'in_progress' | 'completed';
  tags: string[];
  vote_count: number;
  user_voted: boolean;
  created_at: string;
}

const FEATURE_TAGS = [
  'General',
  'Bug Report',
  'Calculator',
  'Invoices',
  'AI Input',
  'Jobs',
  'Integrations',
  'Equipment',
  'Expenses',
  'Mobile',
  'Settings',
  'Custom Rates',
  'PDF / Export',
  'Performance',
];

// ─── Nav ──────────────────────────────────────────────────────────────────────

type SectionId = 'contact' | 'feature-requests' | 'help' | 'terms' | 'privacy';

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ElementType }[] = [
  { id: 'contact',          label: 'Contact Us',        icon: MessageSquare },
  { id: 'feature-requests', label: 'Feature Requests',  icon: Lightbulb },
  { id: 'help',             label: 'Help & Guides',     icon: BookOpen },
  { id: 'terms',            label: 'Terms & Conditions',icon: FileText },
  { id: 'privacy',          label: 'Privacy Policy',    icon: Shield },
];

// ─── Status colours ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  requested:   'bg-gray-100 text-gray-600',
  planned:     'bg-blue-50 text-blue-600',
  in_progress: 'bg-amber-50 text-amber-700',
  completed:   'bg-green-50 text-green-700',
};

const STATUS_COLORS: Record<string, string> = {
  requested:   '#FFD528',
  planned:     '#60a5fa',
  in_progress: '#f97316',
  completed:   '#4ade80',
};

const STATUS_LABELS: Record<string, string> = {
  requested:   'Requested',
  planned:     'Planned',
  in_progress: 'In Progress',
  completed:   'Done',
};

// ─── Help content ─────────────────────────────────────────────────────────────

const HELP_SECTIONS: {
  id: string;
  title: string;
  icon: React.ElementType;
  screenshot?: string;
  items: { heading: string; body: string }[];
}[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: LayoutDashboard,
    screenshot: helpDashboard,
    items: [
      { heading: 'Sign up & log in', body: 'Create an account with your email. You\'ll land on the Dashboard where you can see recent jobs and quick stats.' },
      { heading: 'Creating your first job', body: 'Click "New Job" on the Dashboard. Give it a name (e.g. the commercial title) and you\'re ready to add days.' },
      { heading: 'Navigation', body: 'Use the sidebar on the left to move between pages. On mobile, tap the menu icon in the top-right.' },
    ],
  },
  {
    id: 'calculator',
    title: 'Calculator',
    icon: Calculator,
    screenshot: helpCalculator,
    items: [
      { heading: 'Day Types', body: 'Choose between Studio/Location, Travel Day, Pre-light/De-rig, or Rest Day. Each has different APA rate rules that are applied automatically.' },
      { heading: 'Call & Wrap Times', body: 'Set your call time and wrap time. The calculator works out your total hours, overtime, and any penalties based on APA terms.' },
      { heading: 'Day Rate', body: 'Enter your agreed daily rate. The BHR (basic hourly rate) and overtime rate are calculated automatically based on your OT grade.' },
      { heading: 'Breaks & Penalties', body: 'If your first break starts more than 5.5 hours after call, a £10 delayed meal break penalty applies. Over 6.5 hours converts the day to a Continuous Working Day.' },
      { heading: 'Overtime', body: 'Hours beyond the standard 10-hour day are charged at your OT rate. The grade (I, II, or III) determines the multiplier applied to your BHR.' },
    ],
  },
  {
    id: 'custom-rates',
    title: 'Custom Rates',
    icon: Briefcase,
    items: [
      { heading: 'Adding a custom rate', body: 'Go to Settings → Custom Rates → Add Rate. Enter a role name, daily rate, and overtime grade. You can also set a custom BHR if it differs from the standard rate ÷ 10.' },
      { heading: 'Buyout rates', body: 'Toggle "Buyout" when creating a rate. This sets a flat daily rate with no overtime calculation — the full amount is charged per day regardless of hours.' },
      { heading: 'Using custom rates', body: 'In the Calculator, your custom rates appear in the role dropdown alongside APA standard roles. Select one and it pre-fills your rate and OT settings.' },
    ],
  },
  {
    id: 'jobs',
    title: 'Jobs',
    icon: FolderOpen,
    screenshot: helpJobs,
    items: [
      { heading: 'Managing jobs', body: 'The Jobs page shows all your booking jobs. Each job can have multiple days. Click into a job to see all its days and the running total.' },
      { heading: 'Adding days', body: 'From the Calculator, select a job and fill in the day details. Hit "Save Day" to add it to the job. You can edit or delete days later.' },
      { heading: 'Job totals', body: 'The job total includes all day rates, overtime, penalties, equipment, and expenses across every day in the job.' },
    ],
  },
  {
    id: 'invoices',
    title: 'Invoices',
    icon: FileText,
    screenshot: helpInvoices,
    items: [
      { heading: 'Generating an invoice', body: 'Go to the Invoices page, select a job, fill in your company details and the client\'s billing info, then download the PDF.' },
      { heading: 'Sending by email', body: 'After generating the PDF, enter the recipient\'s email address and optional message. The invoice is sent as a PDF attachment.' },
      { heading: 'Invoice details', body: 'Your company name, address, VAT number, and bank details are pulled from Settings → Company Details. Fill these in once and they\'re reused on every invoice.' },
    ],
  },
  {
    id: 'equipment',
    title: 'Equipment & Expenses',
    icon: Package,
    items: [
      { heading: 'Equipment packages', body: 'Save your kit packages in Settings → My Equipment with a day rate. In the Calculator, select a package and the daily kit fee is added to the day total.' },
      { heading: 'Per-day expenses', body: 'Below Equipment in the Calculator, add an expense amount and description (e.g. parking, taxi, meals). This is included in the day and job totals.' },
    ],
  },
  {
    id: 'ai-input',
    title: 'AI Input',
    icon: Sparkles,
    screenshot: helpAiInput,
    items: [
      { heading: 'How it works', body: 'Describe your working day in plain English — e.g. "Called at 7am, wrapped at 8pm, 45 min lunch at 1pm, drove 30 miles." The AI extracts all the details and fills in the calculator for you.' },
      { heading: 'Review before saving', body: 'AI Input pre-fills the form but doesn\'t save automatically. Always review the values before hitting Save Day.' },
    ],
  },
  {
    id: 'settings-help',
    title: 'Settings',
    icon: Settings,
    screenshot: helpSettings,
    items: [
      { heading: 'User Details', body: 'Your name, phone, and address. Used when generating invoices.' },
      { heading: 'Company Details', body: 'Company name, address, VAT number, and bank details. These pre-fill your invoice templates.' },
      { heading: 'Password', body: 'Change your password at any time. Must be at least 6 characters.' },
      { heading: 'Integrations', body: 'Connect bookkeeping software like Xero, QuickBooks, or FreeAgent to sync invoices automatically. Coming soon.' },
    ],
  },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SupportPage() {
  usePageTitle('Support');
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionId>('contact');

  // Contact form
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [sendingContact, setSendingContact] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Feature requests
  const [featureRequests, setFeatureRequests] = useState<FeatureRequest[]>([]);
  const [featureTitle, setFeatureTitle] = useState('');
  const [featureDescription, setFeatureDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submittingFeature, setSubmittingFeature] = useState(false);
  const [featureError, setFeatureError] = useState<string | null>(null);
  const [featureSort, setFeatureSort] = useState<'top' | 'new'>('top');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [showFeatureForm, setShowFeatureForm] = useState(false);

  // Help accordion
  const [expandedHelp, setExpandedHelp] = useState<string | null>('getting-started');

  // Pre-fill email from user
  useEffect(() => {
    if (user?.email) setContactEmail(user.email);
  }, [user]);

  // Load feature requests
  useEffect(() => {
    loadFeatureRequests();
  }, [user]);

  const loadFeatureRequests = async () => {
    if (!user) return;
    // Get all requests with vote counts
    const { data: requests } = await supabase
      .from('feature_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (!requests) return;

    // Get this user's votes
    const { data: votes } = await supabase
      .from('feature_request_votes')
      .select('feature_request_id')
      .eq('user_id', user.id);

    const votedIds = new Set(votes?.map(v => v.feature_request_id) ?? []);

    // Get vote counts
    const { data: counts } = await supabase
      .from('feature_request_votes')
      .select('feature_request_id');

    const countMap: Record<string, number> = {};
    counts?.forEach(v => {
      countMap[v.feature_request_id] = (countMap[v.feature_request_id] || 0) + 1;
    });

    setFeatureRequests(requests.map(r => ({
      ...r,
      vote_count: countMap[r.id] || 0,
      user_voted: votedIds.has(r.id),
    })));
  };

  // Contact form submit
  const handleSendContact = async () => {
    if (!contactName.trim() || !contactEmail.trim() || !contactSubject.trim() || !contactMessage.trim()) {
      setContactError('All fields are required');
      return;
    }
    setSendingContact(true);
    setContactError(null);
    try {
      const res = await fetch('/api/email/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName.trim(),
          email: contactEmail.trim(),
          subject: contactSubject.trim(),
          message: contactMessage.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to send' }));
        setContactError(data.error || 'Failed to send message');
        setSendingContact(false);
        return;
      }
      setContactSent(true);
      setContactSubject('');
      setContactMessage('');
      setSendingContact(false);
      setTimeout(() => setContactSent(false), 5000);
    } catch (err) {
      setContactError(String(err));
      setSendingContact(false);
    }
  };

  // Feature request submit
  const handleSubmitFeature = async () => {
    if (!user || !featureTitle.trim()) return;
    setSubmittingFeature(true);
    setFeatureError(null);

    const { error } = await supabase.from('feature_requests').insert({
      user_id: user.id,
      user_name: 'Anonymous',
      title: featureTitle.trim(),
      description: featureDescription.trim(),
      tags: selectedTags,
    });

    setSubmittingFeature(false);
    if (error) {
      setFeatureError(error.message);
    } else {
      setFeatureTitle('');
      setFeatureDescription('');
      setSelectedTags([]);
      setShowFeatureForm(false);
      await loadFeatureRequests();
    }
  };

  // Vote toggle
  const handleVote = async (requestId: string, currentlyVoted: boolean) => {
    if (!user) return;
    if (currentlyVoted) {
      await supabase
        .from('feature_request_votes')
        .delete()
        .eq('user_id', user.id)
        .eq('feature_request_id', requestId);
    } else {
      await supabase
        .from('feature_request_votes')
        .insert({ user_id: user.id, feature_request_id: requestId });
    }
    await loadFeatureRequests();
  };

  // Filtered + sorted requests
  const sortedRequests = [...featureRequests]
    .filter(r => !activeTagFilter || r.tags?.includes(activeTagFilter))
    .sort((a, b) =>
      featureSort === 'top'
        ? b.vote_count - a.vote_count
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-2 mb-6">
        <LifeBuoy className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Support</h1>
      </div>

      <div className="flex gap-6 items-start">

        {/* ── Left sidebar nav ── */}
        <div className="w-52 shrink-0">
          <nav className="space-y-0.5">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left',
                  activeSection === item.id
                    ? 'bg-[#1F1F21] text-white'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {activeSection === item.id && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Right content panel ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* CONTACT US */}
          {activeSection === 'contact' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> Contact Us</CardTitle>
                <CardDescription>Got a question, issue, or just want to say hi? We'll get back to you as soon as we can.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Your name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="you@example.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input value={contactSubject} onChange={e => setContactSubject(e.target.value)} placeholder="What's this about?" />
                </div>
                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea
                    value={contactMessage}
                    onChange={e => setContactMessage(e.target.value)}
                    placeholder="Tell us more..."
                    rows={5}
                  />
                </div>
                {contactError && <p className="text-sm text-destructive">{contactError}</p>}
                {contactSent && <p className="text-sm text-green-600">Message sent! We'll be in touch.</p>}
                <Button onClick={handleSendContact} disabled={sendingContact} className="w-full">
                  <Send className="h-4 w-4 mr-2" />
                  {sendingContact ? 'Sending...' : 'Send Message'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* FEATURE REQUESTS */}
          {activeSection === 'feature-requests' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5" /> Feature Requests</CardTitle>
                      <CardDescription>Suggest features you'd like to see and vote on others</CardDescription>
                    </div>
                    <Button size="sm" onClick={() => { setShowFeatureForm(!showFeatureForm); setFeatureError(null); }}>
                      {showFeatureForm ? 'Cancel' : '+ Suggest Feature'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Submit form */}
                  {showFeatureForm && (
                    <div className="space-y-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
                      <div className="space-y-2">
                        <Label>Feature Title</Label>
                        <Input
                          value={featureTitle}
                          onChange={e => setFeatureTitle(e.target.value)}
                          placeholder="e.g. Dark mode, export to CSV..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                        <Textarea
                          value={featureDescription}
                          onChange={e => setFeatureDescription(e.target.value)}
                          placeholder="Tell us more about what you'd like and why..."
                          rows={3}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tags <span className="text-xs font-normal text-muted-foreground">(optional — pick up to 2)</span></Label>
                        <div className="flex flex-wrap gap-1.5">
                          {FEATURE_TAGS.map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setSelectedTags(prev =>
                                prev.includes(tag)
                                  ? prev.filter(t => t !== tag)
                                  : prev.length < 2 ? [...prev, tag] : prev
                              )}
                              className={cn(
                                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                                selectedTags.includes(tag)
                                  ? 'bg-[#1F1F21] text-white border-[#1F1F21]'
                                  : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                              )}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                      {featureError && <p className="text-sm text-destructive">{featureError}</p>}
                      <Button
                        onClick={handleSubmitFeature}
                        disabled={submittingFeature || !featureTitle.trim()}
                        size="sm"
                      >
                        {submittingFeature ? 'Submitting...' : 'Submit Request'}
                      </Button>
                    </div>
                  )}

                  {/* Sort + tag filter bar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setFeatureSort('top')}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        featureSort === 'top' ? 'bg-[#1F1F21] text-white' : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      Top
                    </button>
                    <button
                      onClick={() => setFeatureSort('new')}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        featureSort === 'new' ? 'bg-[#1F1F21] text-white' : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      New
                    </button>
                    <div className="w-px h-4 bg-border mx-1" />
                    {FEATURE_TAGS.map(tag => (
                      <button
                        key={tag}
                        onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          activeTagFilter === tag
                            ? 'bg-[#1F1F21] text-white border-[#1F1F21]'
                            : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                        )}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>

                  {/* Request list */}
                  {sortedRequests.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{activeTagFilter ? `No requests tagged "${activeTagFilter}"` : 'No feature requests yet. Be the first!'}</p>
                    </div>
                  )}

                  {sortedRequests.map(request => (
                    <div key={request.id} className="flex gap-4 p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                      {/* Vote button — bigger and more prominent */}
                      <button
                        onClick={() => handleVote(request.id, request.user_voted)}
                        className="flex flex-col items-center justify-center w-16 shrink-0 rounded-xl border-2 transition-all py-3 gap-0.5"
                        style={request.user_voted
                          ? { borderColor: STATUS_COLORS[request.status] ?? '#1F1F21', backgroundColor: STATUS_COLORS[request.status] ?? '#1F1F21', color: '#1F1F21' }
                          : { borderColor: (STATUS_COLORS[request.status] ?? '#e5e7eb') + '70', color: '#6b7280' }
                        }
                      >
                        <ChevronUp className="h-5 w-5" />
                        <span className="text-base font-bold leading-none">{request.vote_count}</span>
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold text-sm">{request.title}</p>
                          <Badge className={cn('text-[10px] px-1.5 py-0', STATUS_STYLES[request.status])}>
                            {STATUS_LABELS[request.status]}
                          </Badge>
                        </div>
                        {request.description && (
                          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{request.description}</p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {request.tags?.map(tag => (
                            <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                              {tag}
                            </span>
                          ))}
                          <span className="text-[11px] text-muted-foreground/50">
                            {new Date(request.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {/* HELP & GUIDES */}
          {activeSection === 'help' && (
            <div className="space-y-2">
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Help & Guides</CardTitle>
                  <CardDescription>Learn how every part of Crew Dock works</CardDescription>
                </CardHeader>
              </Card>

              {HELP_SECTIONS.map(section => {
                const isOpen = expandedHelp === section.id;
                return (
                  <div key={section.id} className="rounded-xl border border-border overflow-hidden">
                    <button
                      onClick={() => setExpandedHelp(isOpen ? null : section.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
                    >
                      <section.icon className="h-4.5 w-4.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 font-medium text-sm">{section.title}</span>
                      <ChevronRight className={cn(
                        'h-4 w-4 text-muted-foreground transition-transform duration-200',
                        isOpen && 'rotate-90'
                      )} />
                    </button>
                    {isOpen && (
                      <div className="border-t border-border bg-muted/10">
                        {section.screenshot && (
                          <div className="p-4 pb-0">
                            <img
                              src={section.screenshot}
                              alt={`${section.title} screenshot`}
                              className="w-full rounded-lg border border-border shadow-sm"
                            />
                          </div>
                        )}
                        <div className="px-4 py-4 space-y-4">
                          {section.items.map((item, i) => (
                            <div key={i}>
                              <p className="text-sm font-medium mb-1">{item.heading}</p>
                              <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Terms & Conditions ── */}
          {activeSection === 'terms' && (
            <div className="space-y-4 text-sm leading-relaxed">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Terms &amp; Conditions</CardTitle>
                  <CardDescription>Last updated: March 2026 · Crew Dock is operated by Orbit Innovations Ltd</CardDescription>
                </CardHeader>
              </Card>

              {[
                {
                  title: '1. Acceptance of Terms',
                  body: 'By accessing or using Crew Dock ("the Service"), you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the Service. These terms apply to all users, including free and paid subscribers.',
                },
                {
                  title: '2. Description of Service',
                  body: 'Crew Dock is a web-based rate calculation, job tracking, and invoicing tool for UK film and television crew. It provides APA-based rate calculations as a guide only. Crew Dock does not guarantee the accuracy of any rate or calculation for any specific contract. You are responsible for verifying all figures before submitting invoices.',
                },
                {
                  title: '3. User Accounts',
                  body: 'You must register with a valid email address. You are responsible for maintaining the confidentiality of your password and for all activity under your account. Notify us immediately at support@crewdock.app if you suspect unauthorised access.',
                },
                {
                  title: '4. Acceptable Use',
                  body: 'You agree not to use the Service for any unlawful purpose, to impersonate any person, to upload malicious code, or to attempt to gain unauthorised access to any part of the platform. We reserve the right to suspend or terminate accounts that breach these terms.',
                },
                {
                  title: '5. Subscription & Billing',
                  body: 'Crew Dock Pro is a recurring subscription billed monthly or annually. Payments are processed via Stripe. You may cancel at any time; your access continues until the end of the current billing period. No refunds are issued for partial periods. Pricing may change with 30 days\' notice.',
                },
                {
                  title: '6. Free Trial',
                  body: 'New users receive a 14-day free trial of Crew Dock Pro with no credit card required. At the end of the trial, you will be downgraded to the free tier unless you subscribe. Trial abuse (e.g. creating multiple accounts to extend trial access) will result in account termination.',
                },
                {
                  title: '7. Intellectual Property',
                  body: 'All content, code, and design within Crew Dock is the property of Orbit Innovations Ltd. You may not reproduce, distribute, or create derivative works without express written permission. Your data remains your own.',
                },
                {
                  title: '8. Disclaimers & Limitation of Liability',
                  body: 'The Service is provided "as is" without warranty of any kind. Orbit Innovations Ltd is not liable for any loss of income, incorrect rate calculations, or data loss arising from use of the Service. Our total liability to you shall not exceed the amount you paid in the 12 months prior to the claim.',
                },
                {
                  title: '9. Termination',
                  body: 'You may delete your account at any time via Settings → Danger Zone. All your data will be permanently removed from our servers. We may terminate accounts for breach of these terms with or without notice.',
                },
                {
                  title: '10. Governing Law',
                  body: 'These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.',
                },
                {
                  title: '11. Changes to These Terms',
                  body: 'We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance. We will notify users of material changes by email or in-app notification.',
                },
                {
                  title: '12. Contact',
                  body: 'For questions about these Terms, contact us at support@crewdock.app.',
                },
              ].map(section => (
                <div key={section.title} className="rounded-xl border border-border px-5 py-4 space-y-1.5">
                  <p className="font-semibold text-foreground">{section.title}</p>
                  <p className="text-muted-foreground">{section.body}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Privacy Policy ── */}
          {activeSection === 'privacy' && (
            <div className="space-y-4 text-sm leading-relaxed">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Privacy Policy</CardTitle>
                  <CardDescription>Last updated: March 2026 · GDPR compliant · Data controller: Orbit Innovations Ltd</CardDescription>
                </CardHeader>
              </Card>

              {[
                {
                  title: '1. Who We Are',
                  body: 'Crew Dock is operated by Orbit Innovations Ltd ("we", "us", "our"). We are the data controller for personal data collected through this Service. Contact: support@crewdock.app.',
                },
                {
                  title: '2. What Data We Collect',
                  body: 'We collect: (a) Account data — your email address and display name provided at registration. (b) Profile data — name, phone number, company details, address, and VAT number you enter in Settings. (c) Usage data — jobs, days, rates, invoices, and expenses you create. (d) Technical data — IP address, browser type, and access logs for security and diagnostics.',
                },
                {
                  title: '3. How We Use Your Data',
                  body: 'Your data is used to: provide and improve the Service; generate invoices on your behalf; send transactional emails (invoice delivery, account security); process payments via Stripe; respond to support requests. We do not sell your data to third parties.',
                },
                {
                  title: '4. Legal Basis for Processing (GDPR)',
                  body: 'We process your data under the following legal bases: (a) Contract — processing necessary to provide the Service you have signed up for. (b) Legitimate interests — security monitoring, fraud prevention, and service improvement. (c) Consent — marketing emails (where applicable; you may withdraw consent at any time). (d) Legal obligation — where required by law.',
                },
                {
                  title: '5. Data Retention',
                  body: 'Free tier accounts: data is retained for 6 months of inactivity, then deleted. Pro accounts: data is retained for 3 years of inactivity. You may delete your account and all data at any time via Settings → Danger Zone. Deleted data is removed from live systems immediately; backups are purged within 30 days.',
                },
                {
                  title: '6. Data Sharing',
                  body: 'We share data only with trusted sub-processors necessary to operate the Service: Supabase (database hosting, EU/US); Vercel (hosting, US); Resend (transactional email, US); Stripe (payment processing, US). All processors are bound by GDPR-compliant data processing agreements.',
                },
                {
                  title: '6a. Voluntarily Submitted Calculation Data',
                  body: 'When you choose to report a miscalculation, you may optionally consent to share the relevant calculation data with Crew Dock. This data is used solely to investigate and resolve the reported issue and improve calculation accuracy. It will not be sold, passed on to third parties, or used for any purpose other than resolving your report. Submission is entirely voluntary and requires your explicit consent via a checkbox at the time of submission. The legal basis for this processing is consent (UK GDPR Art. 6(1)(a)). You may withdraw consent at any time by contacting support@crewdock.app.',
                },
                {
                  title: '7. International Transfers',
                  body: 'Some sub-processors operate outside the UK/EEA. Transfers are safeguarded by Standard Contractual Clauses (SCCs) or equivalent mechanisms approved under UK GDPR.',
                },
                {
                  title: '8. Your Rights',
                  body: 'Under UK GDPR you have the right to: access your personal data; correct inaccurate data; request erasure ("right to be forgotten"); restrict or object to processing; data portability; withdraw consent at any time. To exercise any right, contact support@crewdock.app. You also have the right to lodge a complaint with the ICO (ico.org.uk).',
                },
                {
                  title: '9. Cookies',
                  body: 'We use essential cookies only — for authentication sessions and security. We do not use advertising or tracking cookies. No cookie consent banner is required for essential cookies under UK GDPR.',
                },
                {
                  title: '10. Security',
                  body: 'We implement industry-standard security measures including encrypted connections (TLS), row-level security on our database, and hashed passwords managed by Supabase Auth. No method of transmission or storage is 100% secure; we cannot guarantee absolute security.',
                },
                {
                  title: '11. Children',
                  body: 'Crew Dock is not directed at children under 16. We do not knowingly collect data from anyone under 16. If you believe a child has provided us data, contact support@crewdock.app and we will delete it promptly.',
                },
                {
                  title: '12. Changes to This Policy',
                  body: 'We may update this Privacy Policy. We will notify you of significant changes by email or in-app notice. Continued use after changes constitutes acceptance.',
                },
                {
                  title: '13. Contact & DPO',
                  body: 'For privacy enquiries or to exercise your rights: support@crewdock.app. For UK GDPR complaints: Information Commissioner\'s Office, ico.org.uk, 0303 123 1113.',
                },
              ].map(section => (
                <div key={section.title} className="rounded-xl border border-border px-5 py-4 space-y-1.5">
                  <p className="font-semibold text-foreground">{section.title}</p>
                  <p className="text-muted-foreground">{section.body}</p>
                </div>
              ))}
            </div>
          )}


        </div>
      </div>
    </div>
  );
}
