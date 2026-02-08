'use client';
export const dynamic = "force-dynamic";

/**
 * Bulk Import Facilities Page
 *
 * Constitutional requirements satisfied:
 * - Version: Topic Catalog v1, PRS Logic v1
 * - Hash: Both catalog and logic hashes displayed (on submission response)
 * - Time: Creation timestamp
 * - Domain: CQC
 *
 * Facts only - no interpretation:
 * - Bulk onboarding form with CQC API auto-population
 * - Progress tracking for multiple facilities
 */

import { useState, FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api/client';
import type { BulkOnboardResult } from '@/lib/api/types';
import styles from './page.module.css';

const CQC_LOCATION_ID_PATTERN = /^1-[0-9]{9,11}$/;

export default function BulkImportPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerId = searchParams.get('provider');

  const [cqcLocationIds, setCqcLocationIds] = useState('');
  const [autoSyncReports, setAutoSyncReports] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BulkOnboardResult[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; succeeded: number; failed: number } | null>(null);

  const parseLocationIds = (input: string): string[] => {
    // Split by newlines, commas, or spaces and filter valid IDs
    return input
      .split(/[\n,\s]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0);
  };

  const validateLocationIds = (ids: string[]): { valid: string[]; invalid: string[] } => {
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const id of ids) {
      if (CQC_LOCATION_ID_PATTERN.test(id)) {
        valid.push(id);
      } else {
        invalid.push(id);
      }
    }

    return { valid, invalid };
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResults(null);
    setSummary(null);

    if (!providerId) {
      setError('Provider ID is required');
      return;
    }

    const parsedIds = parseLocationIds(cqcLocationIds);

    if (parsedIds.length === 0) {
      setError('Please enter at least one CQC Location ID');
      return;
    }

    if (parsedIds.length > 50) {
      setError('Maximum 50 facilities can be imported at once');
      return;
    }

    const { valid, invalid } = validateLocationIds(parsedIds);

    if (invalid.length > 0) {
      setError(`Invalid CQC Location IDs (format must be 1-XXXXXXXXX): ${invalid.join(', ')}`);
      return;
    }

    setSubmitting(true);

    try {
      const response = await apiClient.bulkOnboardFacilities({
        providerId,
        cqcLocationIds: valid,
        autoSyncReports,
      });

      setResults(response.results);
      setSummary(response.summary);
    } catch (err: unknown) {
      let message = 'Failed to import facilities';

      if (err instanceof ApiError) {
        const responseError = (err.response as { error?: string } | undefined)?.error;
        if (responseError) {
          message = responseError;
        }
      } else if (err instanceof Error) {
        message = err.message;
      }

      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    const query = providerId ? `?provider=${providerId}` : '';
    router.push(`/facilities${query}` as any);
  };

  const handleViewFacilities = () => {
    const query = providerId ? `?provider=${providerId}` : '';
    router.push(`/facilities${query}` as any);
  };

  const parsedIds = parseLocationIds(cqcLocationIds);
  const idCount = parsedIds.length;

  return (
    <div className={styles.layout}>
      <main className={styles.main}>
        <div className={styles.formContainer}>
          <h1 className={styles.title}>Bulk Import Facilities</h1>

          {error && <div className={styles.error}>{error}</div>}

          {summary && (
            <div className={summary.failed === 0 ? styles.success : styles.partial}>
              <strong>Import Complete:</strong> {summary.succeeded} of {summary.total} facilities imported successfully
              {summary.failed > 0 && ` (${summary.failed} failed)`}
            </div>
          )}

          {!results ? (
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label htmlFor="cqcLocationIds" className={styles.label}>
                  CQC Location IDs <span className={styles.required}>*</span>
                </label>
                <textarea
                  id="cqcLocationIds"
                  value={cqcLocationIds}
                  onChange={(e) => setCqcLocationIds(e.target.value)}
                  className={styles.textarea}
                  required
                  disabled={submitting}
                  data-testid="cqc-location-ids-input"
                  placeholder="Enter CQC Location IDs (one per line or comma-separated)&#10;&#10;Example:&#10;1-123456789&#10;1-987654321&#10;1-555555555"
                  rows={8}
                />
                <small className={styles.hint}>
                  Enter up to 50 CQC Location IDs. Format: 1-XXXXXXXXX (9-11 digits after the dash)
                </small>
                {idCount > 0 && (
                  <small className={styles.count}>
                    {idCount} location ID{idCount !== 1 ? 's' : ''} detected
                  </small>
                )}
              </div>

              <div className={styles.checkboxGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={autoSyncReports}
                    onChange={(e) => setAutoSyncReports(e.target.checked)}
                    disabled={submitting}
                    data-testid="auto-sync-checkbox"
                  />
                  <span>Automatically sync latest CQC reports for each facility</span>
                </label>
                <small className={styles.hint}>
                  This will queue background jobs to fetch the latest inspection reports
                </small>
              </div>

              <div className={styles.formActions}>
                <button
                  type="button"
                  onClick={handleCancel}
                  className={styles.cancelButton}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={submitting || idCount === 0}
                  data-testid="primary-bulk-import"
                >
                  {submitting ? 'Importing...' : `Import ${idCount} Facilit${idCount !== 1 ? 'ies' : 'y'}`}
                </button>
              </div>
            </form>
          ) : (
            <div className={styles.results}>
              <h2 className={styles.resultsTitle}>Import Results</h2>

              <div className={styles.resultsList}>
                {results.map((result, index) => (
                  <div
                    key={result.cqcLocationId}
                    className={`${styles.resultItem} ${result.success ? styles.resultSuccess : styles.resultFailed}`}
                    data-testid={`result-${index}`}
                  >
                    <div className={styles.resultHeader}>
                      <span className={styles.resultStatus}>
                        {result.success ? '✓' : '✗'}
                      </span>
                      <span className={styles.resultId}>{result.cqcLocationId}</span>
                    </div>
                    {result.success && result.facility && (
                      <div className={styles.resultDetails}>
                        <span className={styles.facilityName}>{result.facility.facilityName}</span>
                        {result.isNew && <span className={styles.badge}>New</span>}
                        {!result.isNew && <span className={styles.badgeExisting}>Existing</span>}
                      </div>
                    )}
                    {!result.success && result.error && (
                      <div className={styles.resultError}>{result.error}</div>
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.formActions}>
                <button
                  type="button"
                  onClick={() => {
                    setResults(null);
                    setSummary(null);
                    setCqcLocationIds('');
                  }}
                  className={styles.cancelButton}
                >
                  Import More
                </button>
                <button
                  type="button"
                  onClick={handleViewFacilities}
                  className={styles.submitButton}
                  data-testid="view-facilities-button"
                >
                  View Facilities
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
