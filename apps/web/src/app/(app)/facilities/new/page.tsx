'use client';
export const dynamic = "force-dynamic";


/**
 * New Facility Page - CQC Auto-Onboarding
 *
 * Constitutional requirements satisfied:
 * - Version: Topic Catalog v1, PRS Logic v1
 * - Hash: Both catalog and logic hashes displayed (on submission response)
 * - Time: Creation timestamp
 * - Domain: CQC
 *
 * Facts only - no interpretation:
 * - Facility onboarding form with CQC API auto-population
 * - Required fields validated
 */

import { useState, FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiClient, ApiError } from '@/lib/api/client';
import type { OnboardFacilityRequest } from '@/lib/api/types';
import styles from './page.module.css';

const CQC_LOCATION_ID_PATTERN = /^1-[0-9]{7,13}$/;

export default function NewFacilityPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const providerId = searchParams.get('provider');

  const [facilityName, setFacilityName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [townCity, setTownCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [cqcLocationId, setCqcLocationId] = useState('');
  const [serviceType, setServiceType] = useState('residential');
  const [capacity, setCapacity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchAttempted, setFetchAttempted] = useState(false);
  const [dataSource, setDataSource] = useState<'CQC_API' | 'MANUAL' | null>(null);

  const handleFetchFromCqc = async () => {
    setError(null);

    if (!cqcLocationId.trim()) {
      setError('CQC Location ID is required');
      return;
    }

    if (!CQC_LOCATION_ID_PATTERN.test(cqcLocationId.trim())) {
      setError('CQC Location ID must match format: 1-XXXXXXXXX (digits after the dash)');
      return;
    }

    setFetching(true);

    try {
      const response = await apiClient.fetchCqcLocation(cqcLocationId.trim());

      if (response.found && response.data) {
        const cqc = response.data;
        setFacilityName(cqc.name || '');
        setAddressLine1(cqc.postalAddressLine1 || '');
        setTownCity(cqc.postalAddressTownCity || '');
        setPostcode(cqc.postalCode || '');
        // Normalize CQC service type
        const cqcType = (cqc.type || '').toLowerCase();
        if (cqcType.includes('nursing') && !cqcType.includes('without nursing')) {
          setServiceType('nursing');
        } else if (cqcType.includes('domiciliary') || cqcType.includes('home care')) {
          setServiceType('domiciliary');
        } else if (cqcType.includes('supported living')) {
          setServiceType('supported_living');
        } else if (cqcType.includes('hospice')) {
          setServiceType('hospice');
        } else {
          setServiceType('residential');
        }
        setCapacity(cqc.numberOfBeds?.toString() || '');
        setFetchAttempted(true);
        setDataSource('CQC_API');
        setError(null);
      } else {
        const errorMsg = response.error?.message || 'Location not found in CQC database';
        setError(`CQC lookup: ${errorMsg}. Please enter details manually.`);
        setDataSource('MANUAL');
        setFetchAttempted(true);
      }

      setFetching(false);
    } catch (err: unknown) {
      let message = 'Failed to fetch CQC data. Please enter details manually.';

      if (err instanceof ApiError) {
        const responseError = (err.response as { error?: string } | undefined)?.error;
        if (responseError) {
          message = responseError;
        }
      } else if (err instanceof Error) {
        message = err.message;
      }

      setError(message);
      setDataSource('MANUAL');
      setFetchAttempted(true);
      setFetching(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!providerId) {
      setError('Provider ID is required');
      return;
    }

    // Validate all required fields are filled (CQC fetch is optional)
    if (!facilityName.trim() || !addressLine1.trim() || !townCity.trim() || !postcode.trim() || !cqcLocationId.trim() || !serviceType.trim()) {
      setError('All required fields must be filled');
      return;
    }

    setSubmitting(true);

    try {
      const request: OnboardFacilityRequest = {
        providerId,
        cqcLocationId: cqcLocationId.trim(),
        facilityName: facilityName.trim(),
        addressLine1: addressLine1.trim(),
        townCity: townCity.trim(),
        postcode: postcode.trim(),
        serviceType: serviceType.trim(),
        capacity: capacity.trim() ? parseInt(capacity.trim(), 10) : undefined,
      };

      const response = await apiClient.onboardFacility(request);

      // Redirect to facility detail page
      const query = providerId ? `?provider=${providerId}` : '';
      router.push(`/facilities/${response.facility.id}${query}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create facility');
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    const query = providerId ? `?provider=${providerId}` : '';
    router.push(`/facilities${query}` as any);
  };

  return (
    <div className={styles.layout}>
      <main className={styles.main}>
        <div className={styles.formContainer}>
          <h1 className={styles.title}>Add New Facility</h1>

          {error && <div className={styles.error}>{error}</div>}

          {fetchAttempted && dataSource === 'CQC_API' && (
            <div className={styles.success}>
              ✅ Facility data successfully fetched from CQC API
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            {/* CQC Location ID - Required first */}
            <div className={styles.formGroup}>
              <label htmlFor="cqcLocationId" className={styles.label}>
                CQC Location ID <span className={styles.required}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="cqcLocationId"
                  type="text"
                  value={cqcLocationId}
                  onChange={(e) => {
                    setCqcLocationId(e.target.value);
                    setFetchAttempted(false);
                  }}
                  className={styles.input}
                  required
                  disabled={submitting || fetching}
                  data-testid="cqc-location-id-input"
                  placeholder="e.g., 1-123456789"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleFetchFromCqc}
                  className={styles.fetchButton}
                  disabled={submitting || fetching || !cqcLocationId.trim()}
                  data-testid="fetch-cqc-button"
                >
                  {fetching ? 'Fetching...' : 'Fetch from CQC'}
                </button>
              </div>
              <small className={styles.hint}>
                Enter CQC Location ID and click "Fetch from CQC" to auto-populate all fields
              </small>
            </div>

            {/* Form fields - always visible (CQC fetch will auto-populate) */}
            {(
              <>
                <div className={styles.formGroup}>
                  <label htmlFor="facilityName" className={styles.label}>
                    Facility Name <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="facilityName"
                    type="text"
                    value={facilityName}
                    onChange={(e) => setFacilityName(e.target.value)}
                    className={styles.input}
                    required
                    disabled={submitting}
                    data-testid="facility-name-input"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="addressLine1" className={styles.label}>
                    Address Line 1 <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="addressLine1"
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    className={styles.input}
                    required
                    disabled={submitting}
                    data-testid="address-line1-input"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="townCity" className={styles.label}>
                    Town / City <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="townCity"
                    type="text"
                    value={townCity}
                    onChange={(e) => setTownCity(e.target.value)}
                    className={styles.input}
                    required
                    disabled={submitting}
                    data-testid="town-city-input"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="postcode" className={styles.label}>
                    Postcode <span className={styles.required}>*</span>
                  </label>
                  <input
                    id="postcode"
                    type="text"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    className={styles.input}
                    required
                    disabled={submitting}
                    data-testid="postcode-input"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="serviceType" className={styles.label}>
                    Service Type <span className={styles.required}>*</span>
                  </label>
                  <select
                    id="serviceType"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className={styles.select}
                    required
                    disabled={submitting}
                    data-testid="service-type-select"
                  >
                    <option value="residential">Residential</option>
                    <option value="nursing">Nursing</option>
                    <option value="domiciliary">Domiciliary</option>
                    <option value="supported_living">Supported Living</option>
                    <option value="hospice">Hospice</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="capacity" className={styles.label}>
                    Capacity (beds/service users)
                  </label>
                  <input
                    id="capacity"
                    type="number"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className={styles.input}
                    disabled={submitting}
                    data-testid="capacity-input"
                    min="1"
                  />
                </div>
              </>
            )}

            <div className={styles.formActions}>
              <button
                type="button"
                onClick={handleCancel}
                className={styles.cancelButton}
                disabled={submitting || fetching}
              >
                Cancel
              </button>
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={submitting || fetching || !facilityName.trim() || !addressLine1.trim() || !townCity.trim() || !postcode.trim() || !cqcLocationId.trim() || !serviceType.trim()}
                  data-testid="primary-create-facility"
                >
                {submitting ? 'Creating...' : 'Create Facility'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
