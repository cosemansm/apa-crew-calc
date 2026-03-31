import { FileText } from 'lucide-react';

const sections = [
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
    body: "Crew Dock Pro is a recurring subscription billed monthly or annually. Payments are processed via Stripe. You may cancel at any time; your access continues until the end of the current billing period. No refunds are issued for partial periods. Pricing may change with 30 days' notice.",
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
];

export function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="h-6 w-6 text-[#FFD528]" />
          <h1 className="text-2xl font-bold">Terms &amp; Conditions</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">Last updated: March 2026 · Crew Dock is operated by Orbit Innovations Ltd</p>

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
