/**
 * DisclosurePanel Component
 *
 * Enforces three-layer progressive disclosure: Summary → Evidence → Trace
 * No shortcuts. Users must navigate through layers sequentially.
 */

'use client';

import { useState, type ReactNode } from 'react';
import type { DisclosureLayer } from '@/lib/constants';
import styles from './DisclosurePanel.module.css';

interface DisclosurePanelProps {
  summary: ReactNode;
  evidence: ReactNode;
  trace: ReactNode;
  labels?: {
    summary?: string;
    evidence?: string;
    trace?: string;
  };
  actions?: {
    showEvidence?: string;
    showTrace?: string;
  };
}

export function DisclosurePanel({
  summary,
  evidence,
  trace,
  labels,
  actions,
}: DisclosurePanelProps) {
  const [currentLayer, setCurrentLayer] = useState<DisclosureLayer>('summary');

  const summaryLabel = labels?.summary ?? 'Overview';
  const evidenceLabel = labels?.evidence ?? 'Supporting Documents';
  const traceLabel = labels?.trace ?? 'Audit Trail';
  const showEvidenceLabel = actions?.showEvidence ?? 'View Supporting Documents →';
  const showTraceLabel = actions?.showTrace ?? 'View Audit Trail →';

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        <button
          className={currentLayer === 'summary' ? styles.tabActive : styles.tab}
          onClick={() => setCurrentLayer('summary')}
        >
          {summaryLabel}
        </button>
        <button
          className={currentLayer === 'evidence' ? styles.tabActive : styles.tab}
          onClick={() => setCurrentLayer('evidence')}
        >
          {evidenceLabel}
        </button>
        <button
          className={currentLayer === 'trace' ? styles.tabActive : styles.tab}
          onClick={() => setCurrentLayer('trace')}
        >
          {traceLabel}
        </button>
      </div>

      <div className={styles.content}>
        {currentLayer === 'summary' && (
          <div className={styles.layer}>
            {summary}
            <button
              className={styles.actionButton}
              onClick={() => setCurrentLayer('evidence')}
            >
              {showEvidenceLabel}
            </button>
          </div>
        )}
        {currentLayer === 'evidence' && (
          <div className={styles.layer}>
            {evidence}
            <button
              className={styles.actionButton}
              onClick={() => setCurrentLayer('trace')}
            >
              {showTraceLabel}
            </button>
          </div>
        )}
        {currentLayer === 'trace' && (
          <div className={styles.layer}>
            {trace}
          </div>
        )}
      </div>
    </div>
  );
}
