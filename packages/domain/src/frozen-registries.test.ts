import { describe, it, expect } from 'vitest';
import {
  getPRSLogicProfilesV1,
  PRS_LOGIC_PROFILES_V1_REGISTRY,
  validateRegistryIntegrity,
} from './frozen-registries.js';
import { validatePRSLogicProfile } from './prs-logic-profile.js';

describe('frozen-registries:prs-logic-profiles', () => {
  it('returns a populated and valid registry', () => {
    const { profile, sha256 } = getPRSLogicProfilesV1();

    expect(profile).toBeTruthy();
    expect(sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(validateRegistryIntegrity(PRS_LOGIC_PROFILES_V1_REGISTRY)).toBe(true);

    const validation = validatePRSLogicProfile(profile);
    expect(validation.ok).toBe(true);
  });
});
