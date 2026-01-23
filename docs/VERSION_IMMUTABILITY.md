# Version Immutability Rule

## Overview

RegIntel enforces **strict version immutability** for all versioned artifacts. Once a version is published (e.g., `v1`), it cannot be modified. This ensures reproducibility, auditability, and prevents retroactive changes to frozen configurations.

## Rule

**Any change to a versioned JSON file (matching `*.v{N}.json`) will fail CI unless the file path is for a new version.**

### Examples

#### ❌ FORBIDDEN - Modifying existing versions

```bash
# These changes will FAIL CI:
git diff topic-catalog.v1.json          # Modifying v1
git diff prs-logic-profiles.v1.json     # Modifying v1
```

#### ✅ ALLOWED - Creating new versions

```bash
# These changes are ALLOWED:
git add topic-catalog.v2.json           # New version v2
git add prs-logic-profiles.v3.json      # New version v3
```

## Rationale

### Temporal Safety
Mock inspection sessions reference specific versions by SHA-256 hash. If v1 could be amended, the hash would change, breaking session reproducibility.

### Audit Trail
Every session stores:
- `topicCatalogVersion: "v1"`
- `topicCatalogSha256: "602df06e..."`

Changing v1 would invalidate all historical audit logs that reference it.

### No "Latest" Semantics
We explicitly reject "latest" versioning. Every session must declare its exact version, preventing ambiguity about which rules were applied.

## Workflow

### When you need to change a versioned artifact:

1. **Create a new version file:**
   ```bash
   cp packages/domain/src/catalog/topic-catalog.v1.json \
      packages/domain/src/catalog/topic-catalog.v2.json
   ```

2. **Make changes to the new version:**
   ```bash
   # Edit topic-catalog.v2.json
   vim packages/domain/src/catalog/topic-catalog.v2.json
   ```

3. **Update registries to support new version:**
   ```typescript
   // In topic-catalog-registry.ts
   export function getTopicCatalog(version: 'v1' | 'v2'): Readonly<TopicCatalog> {
     if (version === 'v2') {
       return topicCatalogV2;
     }
     return topicCatalogV1;
   }
   ```

4. **Update consumers to use new version:**
   ```typescript
   // In mock-inspection-engine.ts
   topicCatalogVersion: 'v2',
   topicCatalogSha256: topic_catalog_v2_sha256,
   ```

5. **v1 remains frozen and accessible:**
   - Old sessions can still replay using v1
   - v1 SHA-256 hash remains valid
   - No historical data is invalidated

## Enforcement

### Local Validation
```bash
pnpm validate:versions
```

### CI Enforcement
The `.github/workflows/ci.yml` workflow automatically runs version immutability checks on every PR and push to main. Any violation will fail the build.

### What Triggers Validation?

The validator checks files matching the pattern: `*.v{N}.json`

Examples:
- `topic-catalog.v1.json` ✓
- `prs-logic-profiles.v1.json` ✓
- `config.v2.json` ✓
- `artifact.v10.json` ✓
- `unversioned-config.json` (ignored)

### How It Works

1. CI fetches full git history
2. Runs `git diff origin/main...HEAD` to find modified files
3. Checks if any modified files match `*.v{N}.json`
4. Verifies whether each file existed in base ref:
   - **Existed in base** → VIOLATION (modification to frozen version)
   - **New file** → ALLOWED (new version being created)

## Current Frozen Versions

| Artifact | Version | SHA-256 | Location |
|----------|---------|---------|----------|
| Topic Catalog | v1 | `602df06e73ab...` | `packages/domain/src/catalog/topic-catalog.v1.json` |
| PRS Logic Profiles | v1 | `d24015c9f477...` | `packages/domain/src/logic/prs-logic-profiles.v1.json` |

## Migration Strategy

When introducing breaking changes:

1. Create new version (e.g., v2)
2. Update registries to support both v1 and v2
3. Update new sessions to use v2
4. **Keep v1 frozen** - old sessions still work
5. Eventually deprecate v1 in documentation (but never delete)

## FAQ

**Q: Can I fix a typo in v1?**
A: No. Create v2 with the fix. V1 must remain byte-for-byte identical.

**Q: What if v1 has a critical bug?**
A: Create v2 with the fix. Mark v1 as deprecated in docs. Do not modify v1.

**Q: Can I delete v1 if everyone migrated to v2?**
A: No. Historical sessions reference v1 by hash. Deletion would break auditability.

**Q: How do I test changes before creating a new version?**
A: Use a separate branch with a temporary unversioned file (e.g., `topic-catalog.draft.json`). Once finalized, rename to `v2.json` before merging.

## See Also

- `scripts/validate-version-immutability.ts` - Validation script implementation
- `scripts/validate-version-immutability.test.ts` - Validation tests
- `.github/workflows/ci.yml` - CI enforcement configuration
