import type { Route } from 'next';
import Link from 'next/link';
import styles from './LandingPage.module.css';

export default function LandingPage() {
  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoAccent}>Reg</span>Intel
        </div>
        <nav className={styles.nav}>
          <Link href={'/sign-in' as Route} className={styles.navLink}>
            Sign In
          </Link>
          <Link href={'/sign-up' as Route} className={styles.navCta}>
            Get Started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>
          Prove Inspection Readiness
          <br />
          <span className={styles.heroAccent}>Before Inspectors Arrive</span>
        </h1>
        <p className={styles.heroSubtitle}>
          RegIntel helps UK care providers run evidence-based mock inspections,
          identify compliance gaps, and build confidence before CQC visits.
        </p>
        <div className={styles.heroCtas}>
          <Link href={'/sign-up' as Route} className={styles.ctaPrimary}>
            Start Free Trial
          </Link>
          <Link href="#how-it-works" className={styles.ctaSecondary}>
            See How It Works
          </Link>
        </div>
      </section>

      {/* Problem */}
      <section className={styles.problemSection}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>Why Care Providers Fail Inspections</h2>
          <div className={styles.cardGrid}>
            <div className={styles.card}>
              <div className={styles.cardIcon} aria-hidden="true">!</div>
              <h3 className={styles.cardTitle}>Evidence is Fragmented</h3>
              <p className={styles.cardText}>
                Policies scattered across folders, training records incomplete,
                audit trails missing.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon} aria-hidden="true">⏱</div>
              <h3 className={styles.cardTitle}>Preparation is Reactive</h3>
              <p className={styles.cardText}>
                Most providers only discover gaps when the inspector is already there.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.cardIcon} aria-hidden="true">?</div>
              <h3 className={styles.cardTitle}>Mock Inspections Guess</h3>
              <p className={styles.cardText}>
                Traditional mock inspections are subjective and inconsistent.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section id="how-it-works" className={styles.stepsSection}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>How RegIntel Works</h2>
          <div className={styles.stepGrid}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3 className={styles.stepTitle}>Upload Your Evidence</h3>
              <p className={styles.stepText}>
                Policies, training records, audits. We map them to CQC requirements.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3 className={styles.stepTitle}>Run Mock Inspection</h3>
              <p className={styles.stepText}>
                AI-powered inspection simulation asks the questions inspectors ask.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3 className={styles.stepTitle}>Get Actionable Report</h3>
              <p className={styles.stepText}>
                Know exactly what would pass, what would fail, and why.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className={styles.pricingSection}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>Simple Pricing</h2>
          <div className={styles.pricingGrid}>
            <div className={styles.pricingCard}>
              <h3 className={styles.pricingName}>Starter</h3>
              <div className={styles.pricingPrice}>
                £99<span className={styles.pricingPeriod}>/month</span>
              </div>
              <ul className={styles.pricingFeatures}>
                <li>1 facility</li>
                <li>Unlimited mock inspections</li>
                <li>Evidence management</li>
                <li>Inspection readiness reports</li>
              </ul>
              <Link href={'/sign-up' as Route} className={styles.pricingCta}>
                Start Free Trial
              </Link>
            </div>
            <div className={styles.pricingCardFeatured}>
              <h3 className={styles.pricingName}>Professional</h3>
              <div className={styles.pricingPrice}>
                £249<span className={styles.pricingPeriod}>/month</span>
              </div>
              <ul className={styles.pricingFeatures}>
                <li>Up to 5 facilities</li>
                <li>Everything in Starter</li>
                <li>Priority support</li>
                <li>Custom inspection topics</li>
                <li>Team access</li>
              </ul>
              <Link href={'/sign-up' as Route} className={styles.pricingCta}>
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={styles.finalCta}>
        <div className={styles.sectionInner}>
          <h2 className={styles.finalCtaTitle}>Ready to Prove Your Readiness?</h2>
          <p className={styles.finalCtaText}>
            Start your free trial. No credit card required.
          </p>
          <Link href={'/sign-up' as Route} className={styles.ctaPrimary}>
            Get Started Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerCopy}>© 2026 RegIntel. All rights reserved.</div>
          <div className={styles.footerLinks}>
            <Link href="/terms" className={styles.footerLink}>
              Terms of Service
            </Link>
            <Link href="/privacy" className={styles.footerLink}>
              Privacy Policy
            </Link>
            <Link
              href="mailto:hello@regintelai.co.uk"
              className={styles.footerLink}
              rel="noopener noreferrer"
            >
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
