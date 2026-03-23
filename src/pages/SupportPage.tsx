import { useState, useEffect } from 'react';
import {
  LifeBuoy, MessageSquare, Lightbulb, BookOpen, Send, ChevronUp, ChevronRight,
  Calculator, FolderOpen, FileText, Sparkles, Settings, Package, Receipt,
  LayoutDashboard, History, Briefcase, CalendarDays, Clock, Coffee, Car,
} from 'lucide-react';
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
  status: 'submitted' | 'planned' | 'in_progress' | 'completed';
  vote_count: number;
  user_voted: boolean;
  created_at: string;
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

type SectionId = 'contact' | 'feature-requests' | 'help';

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ElementType }[] = [
  { id: 'contact',          label: 'Contact Us',        icon: MessageSquare },
  { id: 'feature-requests', label: 'Feature Requests',  icon: Lightbulb },
  { id: 'help',             label: 'Help & Guides',     icon: BookOpen },
];

// ─── Status colours ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  submitted:   'bg-gray-100 text-gray-600',
  planned:     'bg-blue-50 text-blue-600',
  in_progress: 'bg-amber-50 text-amber-700',
  completed:   'bg-green-50 text-green-700',
};

const STATUS_LABELS: Record<string, string> = {
  submitted:   'Submitted',
  planned:     'Planned',
  in_progress: 'In Progress',
  completed:   'Done',
};

// ─── Help content ─────────────────────────────────────────────────────────────

const HELP_SECTIONS: {
  id: string;
  title: string;
  icon: React.ElementType;
  items: { heading: string; body: string }[];
}[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: LayoutDashboard,
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
    items: [
      { heading: 'How it works', body: 'Describe your working day in plain English — e.g. "Called at 7am, wrapped at 8pm, 45 min lunch at 1pm, drove 30 miles." The AI extracts all the details and fills in the calculator for you.' },
      { heading: 'Review before saving', body: 'AI Input pre-fills the form but doesn\'t save automatically. Always review the values before hitting Save Day.' },
    ],
  },
  {
    id: 'settings-help',
    title: 'Settings',
    icon: Settings,
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
  const [submittingFeature, setSubmittingFeature] = useState(false);
  const [featureSort, setFeatureSort] = useState<'top' | 'new'>('top');
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
      const res = await fetch('/api/send-support', {
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

    // Get user display name
    const { data: settings } = await supabase
      .from('user_settings')
      .select('display_name')
      .eq('user_id', user.id)
      .single();

    const { error } = await supabase.from('feature_requests').insert({
      user_id: user.id,
      user_name: settings?.display_name || user.email?.split('@')[0] || 'Anonymous',
      title: featureTitle.trim(),
      description: featureDescription.trim(),
    });

    setSubmittingFeature(false);
    if (!error) {
      setFeatureTitle('');
      setFeatureDescription('');
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

  // Sorted requests
  const sortedRequests = [...featureRequests].sort((a, b) =>
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
                    <Button size="sm" onClick={() => setShowFeatureForm(!showFeatureForm)}>
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
                      <Button
                        onClick={handleSubmitFeature}
                        disabled={submittingFeature || !featureTitle.trim()}
                        size="sm"
                      >
                        {submittingFeature ? 'Submitting...' : 'Submit Request'}
                      </Button>
                    </div>
                  )}

                  {/* Sort toggle */}
                  <div className="flex items-center gap-2">
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
                  </div>

                  {/* Request list */}
                  {sortedRequests.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No feature requests yet. Be the first!</p>
                    </div>
                  )}

                  {sortedRequests.map(request => (
                    <div key={request.id} className="flex gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                      {/* Vote button */}
                      <button
                        onClick={() => handleVote(request.id, request.user_voted)}
                        className={cn(
                          'flex flex-col items-center justify-center w-12 shrink-0 rounded-lg border transition-colors py-2',
                          request.user_voted
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
                        )}
                      >
                        <ChevronUp className="h-4 w-4" />
                        <span className="text-sm font-semibold">{request.vote_count}</span>
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{request.title}</p>
                          <Badge className={cn('text-[10px] px-1.5 py-0', STATUS_STYLES[request.status])}>
                            {STATUS_LABELS[request.status]}
                          </Badge>
                        </div>
                        {request.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{request.description}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground/60 mt-1.5">
                          {request.user_name} · {new Date(request.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
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
                      <div className="border-t border-border px-4 py-3 space-y-4 bg-muted/10">
                        {section.items.map((item, i) => (
                          <div key={i}>
                            <p className="text-sm font-medium mb-1">{item.heading}</p>
                            <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
