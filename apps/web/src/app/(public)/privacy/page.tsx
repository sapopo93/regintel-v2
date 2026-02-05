import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <Link href="/" className="text-emerald-400 hover:underline mb-8 block">
          ← Back to Home
        </Link>
        
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-slate-400 mb-8">Last updated: February 2026</p>

        <div className="prose prose-invert max-w-none">
          <h2 className="text-2xl font-bold mt-8 mb-4">1. Introduction</h2>
          <p className="text-slate-300 mb-4">
            RegIntel Ltd (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is committed to protecting your 
            privacy. This Privacy Policy explains how we collect, use, and protect 
            your personal data when you use our service.
          </p>
          <p className="text-slate-300 mb-4">
            We are the data controller for the personal data we process. Our 
            registered address is [Address to be added].
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">2. Data We Collect</h2>
          <p className="text-slate-300 mb-4">We collect the following types of data:</p>
          <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
            <li><strong>Account Data:</strong> Name, email address, organisation name</li>
            <li><strong>Facility Data:</strong> Care facility information, CQC location IDs</li>
            <li><strong>Evidence Data:</strong> Documents you upload (policies, training records, audits)</li>
            <li><strong>Usage Data:</strong> How you interact with our service</li>
            <li><strong>Technical Data:</strong> IP address, browser type, device information</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">3. How We Use Your Data</h2>
          <p className="text-slate-300 mb-4">We use your data to:</p>
          <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
            <li>Provide and improve the RegIntel service</li>
            <li>Process mock inspections and generate reports</li>
            <li>Communicate with you about your account</li>
            <li>Ensure security and prevent fraud</li>
            <li>Comply with legal obligations</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">4. Legal Basis for Processing</h2>
          <p className="text-slate-300 mb-4">
            We process your data based on:
          </p>
          <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
            <li><strong>Contract:</strong> To provide the service you&apos;ve signed up for</li>
            <li><strong>Legitimate interests:</strong> To improve our service and ensure security</li>
            <li><strong>Legal obligation:</strong> To comply with applicable laws</li>
            <li><strong>Consent:</strong> For optional communications (you can withdraw anytime)</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">5. Data Sharing</h2>
          <p className="text-slate-300 mb-4">
            We do not sell your personal data. We share data only with:
          </p>
          <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
            <li><strong>Service providers:</strong> Cloud hosting (AWS), authentication (Clerk), payments (Stripe)</li>
            <li><strong>Legal authorities:</strong> When required by law</li>
          </ul>
          <p className="text-slate-300 mb-4">
            All service providers are contractually bound to protect your data.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">6. Data Security</h2>
          <p className="text-slate-300 mb-4">
            We implement industry-standard security measures including:
          </p>
          <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
            <li>Encryption in transit (TLS) and at rest</li>
            <li>Multi-tenant data isolation</li>
            <li>Immutable audit logs</li>
            <li>Regular security assessments</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">7. Data Retention</h2>
          <p className="text-slate-300 mb-4">
            We retain your data for as long as your account is active. After 
            account deletion, we retain data for up to 90 days for backup 
            purposes, then permanently delete it. Audit logs may be retained 
            longer for legal compliance.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">8. Your Rights (UK GDPR)</h2>
          <p className="text-slate-300 mb-4">You have the right to:</p>
          <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
            <li><strong>Access:</strong> Request a copy of your personal data</li>
            <li><strong>Rectification:</strong> Correct inaccurate data</li>
            <li><strong>Erasure:</strong> Request deletion of your data</li>
            <li><strong>Portability:</strong> Receive your data in a portable format</li>
            <li><strong>Object:</strong> Object to certain processing</li>
            <li><strong>Restrict:</strong> Request limited processing</li>
          </ul>
          <p className="text-slate-300 mb-4">
            To exercise these rights, contact us at{' '}
            <a href="mailto:privacy@regintelai.co.uk" className="text-emerald-400 hover:underline">
              privacy@regintelai.co.uk
            </a>
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">9. International Transfers</h2>
          <p className="text-slate-300 mb-4">
            Some of our service providers may process data outside the UK. We 
            ensure appropriate safeguards (such as Standard Contractual Clauses) 
            are in place for any international transfers.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">10. Cookies</h2>
          <p className="text-slate-300 mb-4">
            We use essential cookies for authentication and security. We do not 
            use tracking or advertising cookies.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">11. Changes to This Policy</h2>
          <p className="text-slate-300 mb-4">
            We may update this policy from time to time. We will notify you of 
            significant changes via email or through the Service.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">12. Contact & Complaints</h2>
          <p className="text-slate-300 mb-4">
            For privacy questions or to exercise your rights:{' '}
            <a href="mailto:privacy@regintelai.co.uk" className="text-emerald-400 hover:underline">
              privacy@regintelai.co.uk
            </a>
          </p>
          <p className="text-slate-300 mb-4">
            You also have the right to lodge a complaint with the Information 
            Commissioner&apos;s Office (ICO):{' '}
            <a href="https://ico.org.uk" className="text-emerald-400 hover:underline" target="_blank" rel="noopener noreferrer">
              ico.org.uk
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
