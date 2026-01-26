/**
 * SimulationFrame Component
 *
 * Red border wrapper for mock inspection screens.
 * CRITICAL: This visual distinction prevents users from confusing
 * mock inspections with regulatory history.
 */

'use client';

import { getSimulationFrameStyles } from '@/lib/validators';
import { SimulationWatermark } from './SimulationWatermark';
import styles from './SimulationFrame.module.css';

interface SimulationFrameProps {
  origin?: string;
  reportingDomain?: string;
  children: React.ReactNode;
}

export function SimulationFrame({
  origin,
  reportingDomain,
  children,
}: SimulationFrameProps) {
  const frameStyles = getSimulationFrameStyles({ origin, reportingDomain });

  // If not a simulation, render without frame
  if (!frameStyles) {
    return <>{children}</>;
  }

  return (
    <div
      className={styles.frame}
      style={{
        borderColor: frameStyles.borderColor,
        borderWidth: frameStyles.borderWidth,
      }}
    >
      <SimulationWatermark />
      {children}
    </div>
  );
}
