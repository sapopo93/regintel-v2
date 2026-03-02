/**
 * AdvancedPanel Component
 *
 * Native <details>/<summary> accordion for technical/developer content.
 * Used on the facility detail page to hide raw IDs, hashes, and constitutional
 * metadata from the default customer view while keeping them in the DOM for audit.
 *
 * Keyboard accessible by default (summary is focusable, Enter toggles).
 */

import styles from './AdvancedPanel.module.css';

interface AdvancedPanelProps {
  children: React.ReactNode;
}

export function AdvancedPanel({ children }: AdvancedPanelProps) {
  return (
    <details data-testid="advanced-panel" className={styles.panel}>
      <summary className={styles.summary} aria-label="Advanced technical details">
        Advanced (Technical)
      </summary>
      <div data-testid="advanced-content" className={styles.content}>
        {children}
      </div>
    </details>
  );
}
