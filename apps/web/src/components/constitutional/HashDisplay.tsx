/**
 * HashDisplay Component
 *
 * Displays a truncated hash with copy functionality and full hash tooltip.
 * Always uses monospace font for visual distinction.
 */

'use client';

import { useState } from 'react';
import { truncateHash } from '@/lib/format';
import styles from './HashDisplay.module.css';

interface HashDisplayProps {
  hash: string;
  label?: string;
  showCopy?: boolean;
}

export function HashDisplay({
  hash,
  label,
  showCopy = true,
}: HashDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncated = truncateHash(hash);

  return (
    <div className={styles.container}>
      {label && <span className={styles.label}>{label}:</span>}
      <code className={styles.hash} title={hash}>
        {truncated}
      </code>
      {showCopy && (
        <button
          onClick={handleCopy}
          className={styles.copyButton}
          aria-label="Copy hash"
        >
          {copied ? '✓' : 'Copy'}
        </button>
      )}
    </div>
  );
}
