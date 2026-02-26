'use client';

import type { Route } from 'next';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      {/* Header */}
      <header className="container mx-auto px-6 py-6 flex justify-between items-center">
        <div className="text-2xl font-bold">
          <span className="text-emerald-400">Reg</span>Intel
        </div>
        <nav className="space-x-6">
          <Link href={"/sign-in" as Route} className="hover:text-emerald-400 transition">
            Sign In
          </Link>
          <Link
            href={"/sign-up" as Route}
            className="bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-lg transition"
          >
            Get Started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6">
          Prove Inspection Readiness
          <br />
          <span className="text-emerald-400">Before Inspectors Arrive</span>
        </h1>
        <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-8">
          RegIntel helps UK care providers run evidence-based mock inspections,
          identify compliance gaps, and build confidence before CQC visits.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href={"/sign-up" as Route}
            className="bg-emerald-500 hover:bg-emerald-600 px-8 py-4 rounded-lg text-lg font-semibold transition"
          >
            Start Free Trial
          </Link>
          <Link
            href="#how-it-works"
            className="border border-slate-500 hover:border-emerald-400 px-8 py-4 rounded-lg text-lg transition"
          >
            See How It Works
          </Link>
        </div>
      </section>

      {/* Problem */}
      <section className="bg-slate-800/50 py-20">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">
            Why Care Providers Fail Inspections
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-slate-700/50 p-6 rounded-lg">
              <div className="text-red-400 text-4xl mb-4">📋</div>
              <h3 className="text-xl font-semibold mb-2">Evidence is Fragmented</h3>
              <p className="text-slate-300">
                Policies scattered across folders, training records incomplete,
                audit trails missing.
              </p>
            </div>
            <div className="bg-slate-700/50 p-6 rounded-lg">
              <div className="text-red-400 text-4xl mb-4">⏰</div>
              <h3 className="text-xl font-semibold mb-2">Preparation is Reactive</h3>
              <p className="text-slate-300">
                Most providers only discover gaps when the inspector is already there.
              </p>
            </div>
            <div className="bg-slate-700/50 p-6 rounded-lg">
              <div className="text-red-400 text-4xl mb-4">❓</div>
              <h3 className="text-xl font-semibold mb-2">Mock Inspections Guess</h3>
              <p className="text-slate-300">
                Traditional mock inspections are subjective and inconsistent.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section id="how-it-works" className="py-20">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">
            How RegIntel Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-emerald-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">1</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Upload Your Evidence</h3>
              <p className="text-slate-300">
                Policies, training records, audits. We map them to CQC requirements.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-emerald-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">2</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Run Mock Inspection</h3>
              <p className="text-slate-300">
                AI-powered inspection simulation asks the questions inspectors ask.
              </p>
            </div>
            <div className="text-center">
              <div className="bg-emerald-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">3</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Get Actionable Report</h3>
              <p className="text-slate-300">
                Know exactly what would pass, what would fail, and why.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-slate-800/50 py-20">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">Simple Pricing</h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-slate-700 p-8 rounded-lg">
              <h3 className="text-2xl font-bold mb-2">Starter</h3>
              <div className="text-4xl font-bold mb-4">
                £99<span className="text-lg text-slate-400">/month</span>
              </div>
              <ul className="space-y-3 mb-8 text-slate-300">
                <li>✓ 1 facility</li>
                <li>✓ Unlimited mock inspections</li>
                <li>✓ Evidence management</li>
                <li>✓ Inspection readiness reports</li>
              </ul>
              <Link
                href={"/sign-up" as Route}
                className="block text-center bg-emerald-500 hover:bg-emerald-600 py-3 rounded-lg transition"
              >
                Start Free Trial
              </Link>
            </div>
            <div className="bg-emerald-900/30 border-2 border-emerald-500 p-8 rounded-lg">
              <h3 className="text-2xl font-bold mb-2">Professional</h3>
              <div className="text-4xl font-bold mb-4">
                £249<span className="text-lg text-slate-400">/month</span>
              </div>
              <ul className="space-y-3 mb-8 text-slate-300">
                <li>✓ Up to 5 facilities</li>
                <li>✓ Everything in Starter</li>
                <li>✓ Priority support</li>
                <li>✓ Custom inspection topics</li>
                <li>✓ Team access</li>
              </ul>
              <Link
                href={"/sign-up" as Route}
                className="block text-center bg-emerald-500 hover:bg-emerald-600 py-3 rounded-lg transition"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-6">
            Ready to Prove Your Readiness?
          </h2>
          <p className="text-xl text-slate-300 mb-8">
            Start your free trial. No credit card required.
          </p>
          <Link
            href={"/sign-up" as Route}
            className="bg-emerald-500 hover:bg-emerald-600 px-8 py-4 rounded-lg text-lg font-semibold transition inline-block"
          >
            Get Started Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700 py-8">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center">
          <div className="text-slate-400 mb-4 md:mb-0">
            © 2026 RegIntel. All rights reserved.
          </div>
          <div className="space-x-6 text-slate-400">
            <Link href="/terms" className="hover:text-white transition">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-white transition">
              Privacy Policy
            </Link>
            <Link href="mailto:hello@regintelai.co.uk" className="hover:text-white transition">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
