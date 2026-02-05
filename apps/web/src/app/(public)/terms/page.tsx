import Link from 'next/link';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <Link href="/" className="text-emerald-400 hover:underline mb-8 block">
          ← Back to Home
        </Link>
        
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        <p className="text-slate-400 mb-8">Last updated: February 2026</p>

        <div className="prose prose-invert max-w-none">
          <h2 className="text-2xl font-bold mt-8 mb-4">1. Acceptance of Terms</h2>
          <p className="text-slate-300 mb-4">
            By accessing or using RegIntel (&quot;the Service&quot;), operated by RegIntel Ltd 
            (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), you agree to be bound by these Terms of Service. 
            If you do not agree to these terms, please do not use the Service.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">2. Description of Service</h2>
          <p className="text-slate-300 mb-4">
            RegIntel provides a software platform designed to help UK care providers 
            prepare for regulatory inspections through mock inspections, evidence 
            management, and compliance tracking. The Service is advisory in nature 
            and does not guarantee any specific inspection outcomes.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">3. User Accounts</h2>
          <p className="text-slate-300 mb-4">
            You are responsible for maintaining the confidentiality of your account 
            credentials and for all activities that occur under your account. You 
            must notify us immediately of any unauthorized use of your account.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">4. Acceptable Use</h2>
          <p className="text-slate-300 mb-4">You agree not to:</p>
          <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2">
            <li>Use the Service for any unlawful purpose</li>
            <li>Upload false, misleading, or fraudulent information</li>
            <li>Attempt to gain unauthorized access to any part of the Service</li>
            <li>Interfere with or disrupt the Service or servers</li>
            <li>Share your account credentials with unauthorized parties</li>
          </ul>

          <h2 className="text-2xl font-bold mt-8 mb-4">5. Payment Terms</h2>
          <p className="text-slate-300 mb-4">
            Paid subscriptions are billed monthly or annually as selected. All fees 
            are non-refundable except as required by law. We may change our prices 
            with 30 days notice.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">6. Data and Privacy</h2>
          <p className="text-slate-300 mb-4">
            Your use of the Service is also governed by our Privacy Policy. You 
            retain ownership of all data you upload to the Service. We process 
            your data only to provide the Service.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">7. Disclaimer of Warranties</h2>
          <p className="text-slate-300 mb-4">
            THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. 
            RegIntel does not guarantee that mock inspection results will predict 
            actual regulatory inspection outcomes. The Service is an advisory tool 
            and should not replace professional compliance advice.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">8. Limitation of Liability</h2>
          <p className="text-slate-300 mb-4">
            To the maximum extent permitted by law, RegIntel shall not be liable 
            for any indirect, incidental, special, consequential, or punitive 
            damages arising from your use of the Service.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">9. Termination</h2>
          <p className="text-slate-300 mb-4">
            We may terminate or suspend your account at any time for violation of 
            these terms. You may cancel your account at any time through the 
            account settings.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">10. Changes to Terms</h2>
          <p className="text-slate-300 mb-4">
            We may update these terms from time to time. We will notify you of 
            material changes via email or through the Service.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">11. Governing Law</h2>
          <p className="text-slate-300 mb-4">
            These terms are governed by the laws of England and Wales. Any disputes 
            shall be subject to the exclusive jurisdiction of the courts of England 
            and Wales.
          </p>

          <h2 className="text-2xl font-bold mt-8 mb-4">12. Contact</h2>
          <p className="text-slate-300 mb-4">
            Questions about these terms? Contact us at:{' '}
            <a href="mailto:legal@regintelai.co.uk" className="text-emerald-400 hover:underline">
              legal@regintelai.co.uk
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
