# RegIntel Phase Gates
# This file is machine-enforced by CI. Human judgment is not sufficient.
# A phase cannot advance unless ALL required tests pass.

version: 1.0

current_phase_file: ".regintel/current_phase.txt"

phases:

  phase0_foundations:
    description: "Security, tenancy, audit immutability"
    status: ✅ COMPLETE
    required_tests:
      - id: tenant_isolation
        command: "pnpm vitest run -t \"security:tenant\""
        asserts:
          - "cross-tenant read is blocked"
          - "cross-tenant write is blocked"
      - id: audit_chain
        command: "pnpm vitest run -t \"audit:chain\""
        asserts:
          - "hash chain verifies end-to-end"
      - id: secrets_scan
        command: "pnpm vitest run -t \"security:secrets\""
        asserts:
          - "no secrets committed"
    blocks_next_phase_on_failure: true

  phase1_spine:
    description: "Canonical domain model (Regulation → Action)"
    depends_on: [phase0_foundations]
    required_tests:
      - id: no_orphans
        command: "pnpm test spine:no-orphans"
        asserts:
          - "cannot create Action without Finding"
          - "cannot create Finding without ContextSnapshot"
      - id: mock_separation
        command: "pnpm test spine:mock-separation"
        asserts:
          - "SYSTEM_MOCK cannot enter REGULATORY_HISTORY"
      - id: hash_determinism
        command: "pnpm test spine:hashes"
        asserts:
          - "edge_hash deterministic"
          - "provenance_hash deterministic"
    blocks_next_phase_on_failure: true

  phase2_drift:
    description: "Regulatory Drift Engine"
    depends_on: [phase1_spine]
    required_tests:
      - id: cosmetic_change
        command: "pnpm test drift:cosmetic"
        asserts:
          - "typo classified as COSMETIC"
      - id: normative_change
        command: "pnpm test drift:normative"
        asserts:
          - "should→must classified as NORMATIVE"
      - id: drift_determinism
        command: "pnpm test drift:determinism"
        asserts:
          - "same inputs produce same RegulatoryChangeEvent hash"
    blocks_next_phase_on_failure: true

  phase3_policy_intelligence:
    description: "Impact assessment & non-destructive migrations"
    status: ✅ COMPLETE
    depends_on: [phase2_drift]
    required_tests:
      - id: non_destructive_edges
        command: "pnpm test policy-intel:edges"
        asserts:
          - "edges deprecated, never overwritten"
      - id: migration_recommendations
        command: "pnpm test policy-intel:migrations"
        asserts:
          - "KEEP/UPDATE/SPLIT/MERGE decisions deterministic"
    blocks_next_phase_on_failure: true

  phase4_prs_logic:
    description: "PRS Logic Profiles"
    status: ✅ COMPLETE
    depends_on: [phase3_policy_intelligence]
    required_tests:
      - id: logic_determinism
        command: "pnpm test logic:determinism"
        asserts:
          - "same snapshot + profile ⇒ identical outputs"
      - id: interaction_hash
        command: "pnpm test logic:interaction-hash"
        asserts:
          - "interaction_directive_hash stable"
    blocks_next_phase_on_failure: true

  phase5_mock_engine:
    description: "Stateful Mock Inspection Engine"
    status: ✅ COMPLETE
    depends_on: [phase4_prs_logic]
    required_tests:
      - id: followup_limits
        command: "pnpm vitest run -t \"mock:limits\""
        asserts:
          - "max_followups_per_topic enforced"
      - id: event_replay
        command: "pnpm test mock:replay"
        asserts:
          - "replay produces identical session state"
      - id: mock_safety
        command: "pnpm test mock:safety"
        asserts:
          - "mock findings never leak to regulatory history"
    blocks_next_phase_on_failure: true

  phase6_topic_catalog:
    description: "Topic Catalog & relevance control"
    status: ✅ COMPLETE
    depends_on: [phase5_mock_engine]
    required_tests:
      - id: topic_scope
        command: "pnpm vitest run -t \"topics:scope\""
        asserts:
          - "topics reference valid regulation sections"
      - id: evidence_alignment
        command: "pnpm vitest run -t \"topics:evidence\""
        asserts:
          - "evidence requests align with topic definitions"
    blocks_next_phase_on_failure: true

  phase7_outputs:
    description: "Provider-facing outputs"
    status: ✅ COMPLETE
    depends_on: [phase6_topic_catalog]
    required_tests:
      - id: output_purity
        command: "pnpm vitest run -t \"outputs:purity\""
        asserts:
          - "UI derives data only from canonical spine"
          - "no business logic in frontend"
    blocks_next_phase_on_failure: true

# Global enforcement
rules:
  - "CI must read current_phase_file and run all dependent gates"
  - "Failure of any required test blocks merge"
  - "Advancing phase requires explicit update to current_phase_file"

