/**
 * SimulationWatermark Component
 *
 * Diagonal watermark overlay stating "SIMULATION — NOT REGULATORY HISTORY".
 * Prevents misinterpretation of mock inspection results.
 */

import { SIMULATION_WATERMARK } from '@/lib/constants';
import styles from './SimulationWatermark.module.css';

export function SimulationWatermark() {
  return (
    <div className={styles.watermark} aria-hidden="true">
      {SIMULATION_WATERMARK}
    </div>
  );
}
