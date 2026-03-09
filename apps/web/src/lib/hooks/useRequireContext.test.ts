// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockReplace = vi.fn();
let mockContext = { providerId: null as string | null, facilityId: null as string | null };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('./useProviderContext', () => ({
  useProviderContext: () => mockContext,
}));

import { useRequireProviderAndFacility, useRequireProvider } from './useRequireContext';

beforeEach(() => {
  mockReplace.mockClear();
  mockContext = { providerId: null, facilityId: null };
});

describe('useRequireProviderAndFacility', () => {
  it('redirects to / when both params missing', async () => {
    mockContext = { providerId: null, facilityId: null };
    renderHook(() => useRequireProviderAndFacility());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('does not redirect when only provider present (no facility)', async () => {
    // useRequireProviderAndFacility only redirects when BOTH are missing
    mockContext = { providerId: 'prov-1', facilityId: null };
    renderHook(() => useRequireProviderAndFacility());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // provider is set, so no redirect — the hook checks !providerId && !facilityId
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('returns ready=true when both params present', () => {
    mockContext = { providerId: 'prov-1', facilityId: 'fac-1' };
    const { result } = renderHook(() => useRequireProviderAndFacility());

    expect(result.current.ready).toBe(true);
    expect(result.current.providerId).toBe('prov-1');
    expect(result.current.facilityId).toBe('fac-1');
  });

  it('returns ready=false when context missing', () => {
    mockContext = { providerId: null, facilityId: null };
    const { result } = renderHook(() => useRequireProviderAndFacility());

    expect(result.current.ready).toBe(false);
  });
});

describe('useRequireProvider', () => {
  it('redirects when provider missing', async () => {
    mockContext = { providerId: null, facilityId: null };
    renderHook(() => useRequireProvider());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('returns ready=true when provider present', () => {
    mockContext = { providerId: 'prov-1', facilityId: null };
    const { result } = renderHook(() => useRequireProvider());

    expect(result.current.ready).toBe(true);
    expect(result.current.providerId).toBe('prov-1');
  });
});
