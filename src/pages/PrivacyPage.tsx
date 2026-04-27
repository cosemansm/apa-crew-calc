import { Shield } from 'lucide-react';

const sections = [
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
    title: '3a. AI-Powered Features',
    body: 'When you use AI-powered features such as timesheet import or the terms & conditions assistant, the text you provide is sent to Google Gemini for processing. Google acts as a data processor under our agreement and does not use your data to train its models. We do not store the raw text you submit to AI features beyond the duration of the request. The parsed results (structured timesheet data) are stored as part of your project data.',
  },
  {
    title: '4. Legal Basis for Processing (GDPR)',
    body: 'We process your data under the following legal bases: (a) Contract — processing necessary to provide the Service you have signed up for. (b) Legitimate interests — security monitoring, fraud prevention, and service improvement. (c) Consent — marketing emails (where applicable; you may withdraw consent at any time). (d) Legal obligation — where required by law.',
  },
  {
    title: '5. Data Retention',
    body: 'Free tier accounts: data is retained for 6 months, then deleted. Pro accounts: data is retained for 3 years. You may delete your account and all data at any time via Settings → Danger Zone. Deleted data is removed from live systems immediately; backups are purged within 30 days.',
  },
  {
    title: '6. Data Sharing',
    body: 'We share data only with trusted sub-processors necessary to operate the Service: Supabase (database hosting, EU/US); Vercel (hosting, US); Resend (transactional email, US); Stripe (payment processing, US); Sentry (sentry.io — error monitoring and performance tracking, US; receives user identifiers and error context to help us diagnose and fix issues); Vercel Analytics & Speed Insights (anonymous, cookieless page-view and performance analytics; no personal data is collected beyond standard request metadata such as IP address, which is not stored); Google Gemini API (AI-powered timesheet parsing and terms & conditions chat; when you use AI features, the text you enter is sent to Google\'s servers for processing; Google does not use this data to train its models under our API terms); ipapi.co (IP geolocation used once at sign-up to detect your country for regional calculator defaults; your IP address is sent to ipapi.co and no other data is shared); FreeAgent, Xero, and QuickBooks (bookkeeping integrations, when connected; invoice data including descriptions, amounts, dates, and VAT is sent to the connected provider via their API; OAuth credentials are stored securely to maintain your connection). All processors are bound by GDPR-compliant data processing agreements.',
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
    body: "For privacy enquiries or to exercise your rights: support@crewdock.app. For UK GDPR complaints: Information Commissioner's Office, ico.org.uk, 0303 123 1113.",
  },
];

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="h-6 w-6 text-[#FFD528]" />
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">Last updated: April 2026 · GDPR compliant · Data controller: Orbit Innovations Ltd</p>

        <div className="space-y-4 text-sm leading-relaxed">
          {sections.map(section => (
            <div key={section.title} className="rounded-xl border border-border px-5 py-4 space-y-1.5">
              <p className="font-semibold text-foreground">{section.title}</p>
              <p className="text-muted-foreground">{section.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
