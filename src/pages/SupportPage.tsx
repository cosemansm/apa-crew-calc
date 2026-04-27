import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  LifeBuoy, MessageSquare, Lightbulb, BookOpen, Send, ChevronUp, ChevronRight,
  Calculator, FolderOpen, FileText, Sparkles, Settings, Package, Receipt,
  LayoutDashboard, History, Briefcase, CalendarDays, Clock, Coffee, Car, Shield,
  Share2, CreditCard,
} from 'lucide-react';
import { privacySections } from './PrivacyPage';
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
  'Projects',
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
      { heading: 'Sign up & log in', body: 'Create an account with your email. You\'ll get a 14-day free trial of Crew Dock Pro with no credit card required. After the trial, you\'ll keep access to the free tier unless you subscribe.' },
      { heading: 'The Dashboard', body: 'Your home page shows an interactive calendar with your booked days highlighted, monthly and year-to-date earnings, a days-booked progress ring, and a 6-month income chart. Click any day on the calendar to create a new project starting on that date.' },
      { heading: 'Creating your first project', body: 'Click "New Job" on the Dashboard or the Projects page. Enter a project name (e.g. the commercial or show title) and an optional client name, then start adding days via the Calculator.' },
      { heading: 'Navigation', body: 'Use the sidebar on the left to switch between Dashboard, Projects, AI Input, Timesheets, and Support. On mobile, tap the menu icon in the top bar. Settings and your account are at the bottom of the sidebar.' },
      { heading: 'Favourite roles', body: 'Star your most-used crew roles on the Dashboard under "My Department". Starred roles appear first in the Calculator\'s role dropdown for quick access.' },
    ],
  },
  {
    id: 'calculator',
    title: 'Calculator',
    icon: Calculator,
    screenshot: helpCalculator,
    items: [
      { heading: 'How to access it', body: 'The Calculator opens when you click "Edit" on a project, or when you create a new project. It\'s where you fill in the details for each working day.' },
      { heading: 'Day types', body: 'Choose from Shoot Day, Prep Day, Recce Day, Build/Strike Day, Pre-light Day, Travel Day, or Rest Day. Each type has different APA rate rules applied automatically.' },
      { heading: 'Call & wrap times', body: 'Set your call and wrap times. The calculator works out total hours, overtime, and any penalties. For Rest Days, times are skipped and a flat half-day rate is applied.' },
      { heading: 'Day rate & OT grade', body: 'Enter your agreed daily rate. The BHR (basic hourly rate) is calculated as rate / 10. Your OT grade (I, II, or III) sets the overtime multiplier: Grade I = 1.5x, Grade II = 1.25x, Grade III = 1.0x BHR.' },
      { heading: 'Breaks & penalties', body: 'Toggle breaks on and set the start time and duration. A delayed meal break penalty (£10) applies if your first break starts more than 5.5 hours after call. If no break is given within 6.5 hours, the day converts to Continuous Working.' },
      { heading: 'Overtime', body: 'Hours beyond the standard 10-hour day are charged at your OT rate. The cost breakdown panel on the right shows exactly how overtime is calculated.' },
      { heading: 'Equipment & expenses', body: 'Select an equipment package (set up in Settings) to add a daily kit fee. Add per-day expenses like parking, taxi, or meals with a description.' },
      { heading: 'Save & next day', body: 'Click "Save Day" to save the current day, or "Save & Next Day" to save and immediately start entering the next day in the same project.' },
    ],
  },
  {
    id: 'custom-rates',
    title: 'Custom Rates',
    icon: Briefcase,
    items: [
      { heading: 'Why custom rates?', body: 'If your agreed rate doesn\'t match the standard APA rates, or you work under a role not listed, create a custom rate. This saves your rate, OT grade, and BHR for quick reuse.' },
      { heading: 'Adding a custom rate', body: 'Go to Settings \u2192 My Rates \u2192 Add Rate. Enter a role name, daily rate, and choose an OT grade preset (Grade I, II, III, or None). You can also set a custom BHR if it differs from the standard rate \u00f7 10.' },
      { heading: 'Buyout rates', body: 'Toggle "Buyout" when creating a rate. This sets a flat daily rate with no overtime calculation \u2014 the full amount is charged per day regardless of hours worked. Useful for flat-fee bookings.' },
      { heading: 'Using custom rates', body: 'In the Calculator, your custom rates appear in the role dropdown alongside standard APA roles, marked with a "Custom" badge. Select one and it pre-fills your rate and OT settings.' },
    ],
  },
  {
    id: 'jobs',
    title: 'Projects',
    icon: FolderOpen,
    screenshot: helpJobs,
    items: [
      { heading: 'Projects overview', body: 'The Projects page shows all your bookings in a dual-panel layout. The left side lists your projects as cards; click one to see its full details on the right. Use the search bar to filter by project or client name.' },
      { heading: 'Project status', body: 'Each project has a status: Ongoing, Finished, Invoiced, or Paid. The status auto-promotes when all days have passed. You can also set it manually using the status buttons at the top of the detail panel.' },
      { heading: 'Adding & editing days', body: 'Click "Edit" on a project to open the Calculator with that project selected. Fill in the day details and hit "Save Day". You can edit or delete individual days from the project detail view.' },
      { heading: 'Project totals', body: 'The dark total bar at the bottom sums all day rates, overtime, penalties, equipment, and expenses. Click any day row to expand it and see the individual line items.' },
      { heading: 'Timesheets & invoices', body: 'Use the "Timesheet" button to generate a PDF timesheet, or "Invoice" to create a full invoice \u2014 both pre-select the project for you.' },
      { heading: 'Sharing a project', body: 'Click the Share button to generate a link. Anyone with the link can view the project schedule and set their own role and rate. Toggle whether to include mileage and equipment. You can stop sharing at any time.' },
      { heading: 'Duplicate & delete', body: 'Use the copy icon to duplicate a project (all days are recalculated). Use the trash icon to delete. Deletion is permanent.' },
    ],
  },
  {
    id: 'invoices',
    title: 'Timesheets & Invoices',
    icon: FileText,
    screenshot: helpInvoices,
    items: [
      { heading: 'Timesheet tab', body: 'The default view. Select a project and download a PDF timesheet showing all your days, hours, rates, and totals in a clean, professional format.' },
      { heading: 'Invoice tab (Pro)', body: 'Switch to the Invoice tab to create a full invoice. Fill in your client\'s name, address, and email. Your own company details, VAT number, and bank details are pulled from Settings automatically.' },
      { heading: 'VAT support', body: 'If you\'re VAT registered, toggle the VAT switch to add 20% VAT to your invoice. If your client is outside the UK, toggle "Client outside UK" to reverse-charge the VAT.' },
      { heading: 'Sending by email', body: 'Enter the client\'s email address and click "Send to Client". The invoice is sent as a professionally formatted PDF attachment.' },
      { heading: 'Bookkeeping integrations', body: 'If you\'ve connected Xero, FreeAgent, or QuickBooks in Settings, you\'ll see buttons to push the invoice directly to your accounting software as a draft.' },
      { heading: 'Invoice details', body: 'Each invoice gets a unique number and date. The line items show each day with its type, hours, and amount. Payment details (sort code, account number) appear at the bottom.' },
    ],
  },
  {
    id: 'equipment',
    title: 'Equipment & Expenses',
    icon: Package,
    items: [
      { heading: 'Setting up equipment packages', body: 'Go to Settings \u2192 My Equipment \u2192 Add Package. Enter a name (e.g. "Camera Kit", "Sound Package") and a daily rate. You can create as many packages as you need.' },
      { heading: 'Using equipment in the Calculator', body: 'In the Calculator, select an equipment package from the dropdown. The daily kit fee is added to the day total and appears as a separate line item in the cost breakdown.' },
      { heading: 'Per-day expenses', body: 'Below the equipment section in the Calculator, add expense amounts with a description (e.g. parking £12, taxi £25). Each expense is included in the day total and shows on timesheets and invoices.' },
      { heading: 'Equipment on shared projects', body: 'When sharing a project, you can choose whether to include equipment hire in the shared view. This is toggled in the share dialog.' },
    ],
  },
  {
    id: 'ai-input',
    title: 'AI Input',
    icon: Sparkles,
    screenshot: helpAiInput,
    items: [
      { heading: 'What is AI Input?', body: 'A Pro feature that lets you describe your working days in plain English. The AI extracts all the details \u2014 role, call time, wrap time, breaks, day type \u2014 and fills in the calculator for you.' },
      { heading: 'Multi-day input', body: 'You can describe multiple days in a single message. For example: "3 day shoot as Gaffer at \u00a3568. Monday 0800\u20132100, Tuesday 0700\u20131900 continuous, Wednesday travel day." The AI creates a separate entry for each day.' },
      { heading: 'Review & complete', body: 'After processing, you\'ll see a review screen with each day\'s details. Fields the AI couldn\'t determine are highlighted in yellow. Set a global role and rate to fill any gaps, then fine-tune individual days before saving.' },
      { heading: 'APA T&C assistant', body: 'You can also ask questions about APA terms and conditions. Type a question like "When does a meal break penalty apply?" and the AI will answer with references to the relevant APA sections.' },
      { heading: 'Tips for best results', body: 'Include as much detail as you can: role, rate, call/wrap times, break times, and day type. The more you provide, the less you\'ll need to fill in manually. Even partial info works \u2014 just type what you know.' },
    ],
  },
  {
    id: 'settings-help',
    title: 'Settings',
    icon: Settings,
    screenshot: helpSettings,
    items: [
      { heading: 'My Details', body: 'Your name, phone, address, and primary department. Your department determines which crew roles appear first in the Calculator. This info is also used on invoices and timesheets.' },
      { heading: 'Company Details', body: 'Company name, address, VAT number, and bank details (sort code, account number). These pre-fill your invoice and timesheet templates so you only enter them once.' },
      { heading: 'My Rates', body: 'Create and manage custom crew roles with your own daily rates, OT grades, and BHR overrides. See the Custom Rates section above for details.' },
      { heading: 'My Equipment', body: 'Save equipment packages with a daily rate. These appear in the Calculator\'s equipment dropdown for quick selection.' },
      { heading: 'Password', body: 'Change your password at any time. Must be at least 6 characters.' },
      { heading: 'Plan & Billing', body: 'View your current plan (Free, Trial, Pro, or Lifetime), manage your subscription, or upgrade. Pro is available monthly or annually with a 28% saving on the yearly plan.' },
      { heading: 'Integrations', body: 'Connect your accounting software \u2014 Xero, QuickBooks, or FreeAgent \u2014 to push invoices and expenses directly from Crew Dock. Each integration shows its connection status and can be disconnected at any time.' },
      { heading: 'Danger Zone', body: 'Delete your account and all data permanently. Requires typing "DELETE" to confirm. This action cannot be undone.' },
    ],
  },
  {
    id: 'sharing',
    title: 'Sharing & Collaboration',
    icon: Share2,
    items: [
      { heading: 'Sharing a project', body: 'Open a project on the Projects page and click the Share button. A unique link is generated that anyone can use to view the project schedule.' },
      { heading: 'What shared viewers see', body: 'Viewers see the project timeline with day types and dates. They can set their own role and rate to see what they\'d earn on the same schedule. Your personal rate is never shown.' },
      { heading: 'Controlling visibility', body: 'In the share dialog, toggle whether to include mileage expenses and equipment hire. You can stop sharing at any time to revoke the link.' },
      { heading: 'Calendar feed (Pro)', body: 'Subscribe to your Crew Dock calendar in Google Calendar, Apple Calendar, or Outlook. Your booked days appear as events automatically. Find the subscription URL on the Dashboard.' },
    ],
  },
  {
    id: 'billing',
    title: 'Plans & Pricing',
    icon: CreditCard,
    items: [
      { heading: 'Free tier', body: 'Basic access to the Calculator and Projects. Limited to a set number of active projects. Timesheets are available; invoicing requires Pro.' },
      { heading: 'Free trial', body: 'Every new account gets 14 days of Pro for free with no credit card required. At the end of the trial you\'re downgraded to the free tier unless you subscribe.' },
      { heading: 'Pro plan', body: 'Unlocks AI Input, full invoicing with email delivery, bookkeeping integrations, calendar feed, and project sharing. Available monthly or annually (save 28% on yearly).' },
      { heading: 'Lifetime plan', body: 'A one-time payment for permanent Pro access. No renewals, no expiry. Available for a limited time.' },
      { heading: 'Managing your subscription', body: 'Go to Settings \u2192 Plan & Billing to view your current plan, upgrade, or cancel. Cancellation takes effect at the end of your current billing period. Payments are processed securely via Stripe.' },
    ],
  },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

const VALID_SUPPORT_SECTIONS = new Set<string>(['contact', 'feature-requests', 'help', 'terms', 'privacy']);

export function SupportPage() {
  usePageTitle('Support');
  const { user } = useAuth();
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const activeSection: SectionId = (VALID_SUPPORT_SECTIONS.has(section ?? '') ? section : 'contact') as SectionId;

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

  // Grouped requests — fixed status order, sorted within each group
  const STATUS_ORDER: FeatureRequest['status'][] = ['in_progress', 'planned', 'requested', 'completed'];
  const filteredRequests = featureRequests.filter(r => !activeTagFilter || r.tags?.includes(activeTagFilter));
  const groupedRequests = STATUS_ORDER
    .map(status => ({
      status,
      requests: filteredRequests
        .filter(r => r.status === status)
        .sort((a, b) =>
          featureSort === 'top'
            ? b.vote_count - a.vote_count
            : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
    }))
    .filter(g => g.requests.length > 0);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-2 mb-6">
        <LifeBuoy className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Support</h1>
      </div>

      {/* ── Mobile horizontal nav ── */}
      <div className="md:hidden w-full overflow-x-auto pb-1 mb-2">
        <div className="flex gap-1 min-w-max">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => navigate(`/support/${item.id}`)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0',
                activeSection === item.id
                  ? 'bg-[#1F1F21] text-white'
                  : 'text-muted-foreground bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-6 items-start">

        {/* ── Left sidebar nav (desktop only) ── */}
        <div className="hidden md:block w-52 shrink-0">
          <nav className="space-y-0.5">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => navigate(`/support/${item.id}`)}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                  {/* Request list — grouped by status */}
                  {groupedRequests.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">{activeTagFilter ? `No requests tagged "${activeTagFilter}"` : 'No feature requests yet. Be the first!'}</p>
                    </div>
                  )}

                  {groupedRequests.map((group, groupIdx) => (
                    <div key={group.status} className={groupIdx > 0 ? 'mt-6' : ''}>
                      {/* Section header */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[group.status] }} />
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: STATUS_COLORS[group.status] }}>
                          {STATUS_LABELS[group.status]}
                        </span>
                        <span className="text-xs text-muted-foreground/50">{group.requests.length}</span>
                      </div>

                      <div className="space-y-2">
                        {group.requests.map(request => (
                          <div key={request.id} className="flex gap-4 p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                            {/* Vote button */}
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
                              <p className="font-semibold text-sm mb-1">{request.title}</p>
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
                  <CardDescription>Last updated: April 2026 · GDPR compliant · Data controller: Orbit Innovations Ltd</CardDescription>
                </CardHeader>
              </Card>

              {privacySections.map(section => (
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
