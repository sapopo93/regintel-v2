'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { ReadinessStep } from '@/lib/api/types';

interface ReadinessChecklistProps {
  steps: ReadinessStep[];
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  nextRecommendedAction?: {
    label: string;
    href: string;
    reason: string;
  };
}
import styles from './ReadinessChecklist.module.css';

function StatusIcon({ status }: { status: ReadinessStep['status'] }) {
  if (status === 'complete') {
    return (
      <span className={styles.statusIcon} data-status="complete" aria-label="Complete">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="8" fill="#16a34a" />
          <path d="M4.5 8.5L7 11L11.5 5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (status === 'in-progress') {
    return (
      <span className={styles.statusIcon} data-status="in-progress" aria-label="In progress">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="8" fill="#d97706" />
          <circle cx="8" cy="8" r="3" fill="white" />
        </svg>
      </span>
    );
  }
  return (
    <span className={styles.statusIcon} data-status="not-started" aria-label="Not started">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="var(--color-slate-400)" strokeWidth="2" fill="none" />
      </svg>
    </span>
  );
}

function MilestoneBadge({ percent }: { percent: number }) {
  if (percent >= 100) {
    return <span className={styles.milestoneBadge}>All steps complete!</span>;
  }
  if (percent >= 80) {
    return <span className={styles.milestoneBadge}>Almost there — 80%+</span>;
  }
  if (percent >= 50) {
    return <span className={styles.milestoneBadge}>Halfway there!</span>;
  }
  return null;
}

export function ReadinessChecklist({
  steps,
  completedCount,
  totalCount,
  progressPercent,
  nextRecommendedAction,
}: ReadinessChecklistProps) {
  const clampedPercent = Math.min(100, Math.max(0, progressPercent));

  return (
    <div className={styles.container}>
      {/* Progress section */}
      <div className={styles.progressSection}>
        <div className={styles.progressHeader}>
          <span className={styles.progressLabel}>
            {completedCount} of {totalCount} steps complete
          </span>
          <MilestoneBadge percent={clampedPercent} />
        </div>
        <div className={styles.progressBarTrack}>
          <div
            className={styles.progressBarFill}
            style={{ width: `${clampedPercent}%` }}
            role="progressbar"
            aria-valuenow={clampedPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Recommended next action */}
      {nextRecommendedAction && (
        <div className={styles.recommendedCard}>
          <div className={styles.recommendedContent}>
            <span className={styles.recommendedTag}>Recommended Next</span>
            <p className={styles.recommendedReason}>{nextRecommendedAction.reason}</p>
          </div>
          <Link href={nextRecommendedAction.href as Route} className={styles.recommendedButton}>
            {nextRecommendedAction.label}
          </Link>
        </div>
      )}

      {/* Step list */}
      <ul className={styles.stepList}>
        {steps.map((step) => (
          <li key={step.id} className={styles.stepItem} data-status={step.status}>
            <StatusIcon status={step.status} />
            <div className={styles.stepContent}>
              <span className={styles.stepLabel}>{step.label}</span>
              <span className={styles.stepDescription}>{step.description}</span>
            </div>
            {step.actionLabel && step.actionHref && (
              <Link href={step.actionHref as Route} className={styles.stepAction}>
                {step.actionLabel}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
