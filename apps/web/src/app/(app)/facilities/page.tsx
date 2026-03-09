'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useProviderContext } from '@/lib/hooks/useProviderContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetadataBar } from '@/components/constitutional/MetadataBar';
import { apiClient } from '@/lib/api/client';
import type { FacilitiesListResponse, Facility, UpdateFacilityRequest } from '@/lib/api/types';
import { validateConstitutionalRequirements } from '@/lib/validators';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton';
import { useToast } from '@/components/toast/ToastProvider';
import styles from './page.module.css';

export default function FacilitiesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { providerId } = useProviderContext();

  const [data, setData] = useState<FacilitiesListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [editForm, setEditForm] = useState<UpdateFacilityRequest>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const toast = useToast();

  // Redirect to /providers if no provider context available
  useEffect(() => {
    if (!providerId) {
      router.replace('/providers');
    }
  }, [providerId, router]);

  useEffect(() => {
    if (!providerId) return;
    apiClient.getFacilities(providerId)
      .then((response) => {
        validateConstitutionalRequirements(response, { strict: true });
        setData(response);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [providerId]);

  const refreshData = () => {
    if (!providerId) return;
    setLoading(true);
    apiClient.getFacilities(providerId)
      .then((response) => {
        validateConstitutionalRequirements(response, { strict: true });
        setData(response);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const handleAddFacility = () => {
    const query = providerId ? `?provider=${providerId}` : '';
    router.push(`/facilities/new${query}`);
  };

  const handleViewFacility = (facilityId: string) => {
    router.push(`/results?provider=${providerId}&facility=${facilityId}` as any);
  };

  const handleStartEdit = (facility: Facility, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFacility(facility);
    setEditForm({
      facilityName: facility.facilityName,
      addressLine1: facility.addressLine1,
      townCity: facility.townCity,
      postcode: facility.postcode,
      serviceType: facility.serviceType,
      capacity: facility.capacity,
    });
    setEditError(null);
  };

  const handleCancelEdit = () => {
    setEditingFacility(null);
    setEditForm({});
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingFacility) return;
    setSaving(true);
    setEditError(null);
    try {
      await apiClient.updateFacility(editingFacility.id, editForm);
      setEditingFacility(null);
      toast.success('Location updated');
      refreshData();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update location');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFacility = async (facility: Facility, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${facility.facilityName}"? This cannot be undone.`)) {
      return;
    }
    setDeletingId(facility.id);
    try {
      await apiClient.deleteFacility(facility.id);
      refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete location');
    } finally {
      setDeletingId(null);
    }
  };

  const providerName = data?.provider?.providerName ?? 'Provider';
  const snapshotDate = data?.provider?.asOf ?? data?.snapshotTimestamp ?? new Date().toISOString();
  const topicCatalogVersion = data?.topicCatalogVersion ?? 'v1';
  const prsLogicVersion = data?.prsLogicVersion ?? 'v1';

  return (
    <div className={styles.layout}>
      <Sidebar
        providerName={providerName}
        snapshotDate={snapshotDate}
        topicCatalogVersion={topicCatalogVersion}
        prsLogicVersion={prsLogicVersion}
      />

      <main className={styles.main}>
        {loading ? (
          <LoadingSkeleton variant="cards" />
        ) : error || !data ? (
          <ErrorState message={error || 'Failed to load locations'} onRetry={refreshData} />
        ) : (
          <>
            <PageHeader
              title="Locations"
              subtitle={`${data.totalCount} locations registered`}
              topicCatalogVersion={data.topicCatalogVersion}
              topicCatalogHash={data.topicCatalogHash}
              prsLogicVersion={data.prsLogicVersion}
              prsLogicHash={data.prsLogicHash}
              snapshotTimestamp={data.snapshotTimestamp}
              domain={data.domain}
              reportingDomain={data.reportingDomain}
              mode={data.mode}
              reportSource={data.reportSource}
              snapshotId={data.snapshotId}
              ingestionStatus={data.ingestionStatus}
            />

            <MetadataBar
              topicCatalogVersion={data.topicCatalogVersion}
              topicCatalogHash={data.topicCatalogHash}
              prsLogicVersion={data.prsLogicVersion}
              prsLogicHash={data.prsLogicHash}
              snapshotTimestamp={data.snapshotTimestamp}
              domain={data.domain}
              reportingDomain={data.reportingDomain}
              mode={data.mode}
              reportSource={data.reportSource}
              snapshotId={data.snapshotId}
              ingestionStatus={data.ingestionStatus}
            />

            <div className={styles.actions}>
              <button
                className={styles.addButton}
                onClick={handleAddFacility}
                data-testid="add-facility-button"
              >
                Register a Location
              </button>
            </div>

            {editingFacility && (
              <div className={styles.editOverlay} data-testid="edit-facility-form">
                <div className={styles.editForm}>
                  <h3 className={styles.editTitle}>Edit Location</h3>
                  {editError && <div className={styles.error}>{editError}</div>}
                  <div className={styles.editFieldGroup}>
                    <label className={styles.editLabel}>Location Name</label>
                    <input
                      className={styles.editInput}
                      value={editForm.facilityName ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, facilityName: e.target.value })}
                    />
                  </div>
                  <div className={styles.editFieldGroup}>
                    <label className={styles.editLabel}>Address Line 1</label>
                    <input
                      className={styles.editInput}
                      value={editForm.addressLine1 ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, addressLine1: e.target.value })}
                    />
                  </div>
                  <div className={styles.editFieldGroup}>
                    <label className={styles.editLabel}>Town/City</label>
                    <input
                      className={styles.editInput}
                      value={editForm.townCity ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, townCity: e.target.value })}
                    />
                  </div>
                  <div className={styles.editFieldGroup}>
                    <label className={styles.editLabel}>Postcode</label>
                    <input
                      className={styles.editInput}
                      value={editForm.postcode ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, postcode: e.target.value })}
                    />
                  </div>
                  <div className={styles.editFieldGroup}>
                    <label className={styles.editLabel}>Service Type</label>
                    <select
                      className={styles.editInput}
                      value={editForm.serviceType ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, serviceType: e.target.value })}
                    >
                      <option value="residential">Residential</option>
                      <option value="nursing">Nursing</option>
                      <option value="domiciliary">Domiciliary</option>
                      <option value="supported_living">Supported Living</option>
                      <option value="hospice">Hospice</option>
                    </select>
                  </div>
                  <div className={styles.editFieldGroup}>
                    <label className={styles.editLabel}>Capacity</label>
                    <input
                      className={styles.editInput}
                      type="number"
                      min="0"
                      value={editForm.capacity ?? ''}
                      onChange={(e) => setEditForm({ ...editForm, capacity: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                    />
                  </div>
                  <div className={styles.editFieldGroup}>
                    <label className={styles.editLabel}>CQC Location ID</label>
                    <input className={styles.editInput} value={editingFacility.cqcLocationId} disabled />
                  </div>
                  <div className={styles.editActions}>
                    <button className={styles.editSaveButton} onClick={handleSaveEdit} disabled={saving} data-testid="save-edit-button">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button className={styles.editCancelButton} onClick={handleCancelEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {data.facilities.length === 0 ? (
              <div className={styles.empty}>
                <p>No locations registered yet.</p>
                <p>Click &quot;Register a Location&quot; to register your first location.</p>
              </div>
            ) : (
              <div className={styles.facilitiesList}>
                {data.facilities.map((facility) => (
                  <div
                    key={facility.id}
                    className={styles.facilityCard}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleViewFacility(facility.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleViewFacility(facility.id); } }}
                    data-testid={`facility-card-${facility.id}`}
                  >
                    <h3 className={styles.facilityName}>{facility.facilityName}</h3>
                    <div className={styles.facilityDetails}>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>CQC Location ID:</span>
                        <span className={styles.detailValue}>{facility.cqcLocationId}</span>
                      </div>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Service Type:</span>
                        <span className={styles.detailValue}>{facility.serviceType}</span>
                      </div>
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Address:</span>
                        <span className={styles.detailValue}>
                          {facility.addressLine1}, {facility.townCity}, {facility.postcode}
                        </span>
                      </div>
                      {facility.capacity != null && (
                        <div className={styles.detailRow}>
                          <span className={styles.detailLabel}>Capacity:</span>
                          <span className={styles.detailValue}>{facility.capacity}</span>
                        </div>
                      )}
                    </div>
                    <div className={styles.facilityCardFooter}>
                      <div className={styles.facilityHash}>
                        Hash: {facility.facilityHash.substring(0, 16)}...
                      </div>
                      <div className={styles.cardActions}>
                        <button
                          className={styles.editButton}
                          onClick={(e) => handleStartEdit(facility, e)}
                          data-testid={`edit-facility-${facility.id}`}
                        >
                          Edit
                        </button>
                        <button
                          className={styles.deleteButton}
                          onClick={(e) => handleDeleteFacility(facility, e)}
                          disabled={deletingId === facility.id}
                          data-testid={`delete-facility-${facility.id}`}
                        >
                          {deletingId === facility.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
