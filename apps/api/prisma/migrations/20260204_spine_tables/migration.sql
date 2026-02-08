-- Phase 1: The Spine - Add Policy, RegulationPolicyLink, Action, ActionVerification tables
-- These tables complete the core domain model (Regulation → Policy → Finding → Evidence → Action)

-- Create enums for link and action status
CREATE TYPE link_status AS ENUM ('ACTIVE', 'DEPRECATED', 'SUPERSEDED');
CREATE TYPE action_status AS ENUM ('OPEN', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'VERIFIED_CLOSED', 'REJECTED');

-- Policies table (versioned, clause-level provider policies)
CREATE TABLE policies (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    domain domain NOT NULL,
    version INT NOT NULL,
    effective_date TIMESTAMPTZ NOT NULL,
    supersedes VARCHAR(255),
    title TEXT NOT NULL,
    clauses JSONB NOT NULL DEFAULT '[]',
    content_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    approved_by VARCHAR(255),
    approved_at TIMESTAMPTZ,
    UNIQUE (tenant_id, content_hash)
);

CREATE INDEX idx_policies_tenant_id ON policies (tenant_id);
CREATE INDEX idx_policies_tenant_domain ON policies (tenant_id, domain);

-- Enable RLS on policies
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY policies_tenant_isolation ON policies
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- RegulationPolicyLink table (edge-hashed mappings between regulations and policies)
CREATE TABLE regulation_policy_links (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    domain domain NOT NULL,
    regulation_id VARCHAR(255) NOT NULL,
    regulation_section_id VARCHAR(255) NOT NULL,
    policy_id VARCHAR(255) NOT NULL REFERENCES policies(id),
    policy_clause_id VARCHAR(255) NOT NULL,
    status link_status NOT NULL DEFAULT 'ACTIVE',
    rationale TEXT,
    superseded_by VARCHAR(255),
    edge_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    deprecated_at TIMESTAMPTZ,
    deprecated_reason TEXT,
    UNIQUE (tenant_id, edge_hash)
);

CREATE INDEX idx_regulation_policy_links_tenant_id ON regulation_policy_links (tenant_id);
CREATE INDEX idx_regulation_policy_links_tenant_status ON regulation_policy_links (tenant_id, status);
CREATE INDEX idx_regulation_policy_links_regulation_id ON regulation_policy_links (regulation_id);
CREATE INDEX idx_regulation_policy_links_policy_id ON regulation_policy_links (policy_id);

-- Enable RLS on regulation_policy_links
ALTER TABLE regulation_policy_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY regulation_policy_links_tenant_isolation ON regulation_policy_links
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Actions table (remediation with verification state machine)
CREATE TABLE actions (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    domain domain NOT NULL,
    finding_id VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    assigned_to VARCHAR(255),
    target_completion_date TIMESTAMPTZ,
    status action_status NOT NULL DEFAULT 'OPEN',
    verification_evidence_ids TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    completed_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    closed_by VARCHAR(255)
);

CREATE INDEX idx_actions_tenant_id ON actions (tenant_id);
CREATE INDEX idx_actions_tenant_status ON actions (tenant_id, status);
CREATE INDEX idx_actions_finding_id ON actions (finding_id);
CREATE INDEX idx_actions_tenant_assigned_to ON actions (tenant_id, assigned_to);

-- Enable RLS on actions
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY actions_tenant_isolation ON actions
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- ActionVerification table (immutable verification records)
CREATE TABLE action_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id VARCHAR(255) NOT NULL REFERENCES actions(id),
    tenant_id VARCHAR(255) NOT NULL,
    verified_by VARCHAR(255) NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL,
    verification_notes TEXT,
    approved BOOLEAN NOT NULL,
    rejection_reason TEXT
);

CREATE INDEX idx_action_verifications_action_id ON action_verifications (action_id);
CREATE INDEX idx_action_verifications_tenant_id ON action_verifications (tenant_id);

-- Enable RLS on action_verifications
ALTER TABLE action_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY action_verifications_tenant_isolation ON action_verifications
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Grant permissions to app_user (same pattern as existing tables)
GRANT SELECT, INSERT, UPDATE ON policies TO app_user;
GRANT SELECT, INSERT, UPDATE ON regulation_policy_links TO app_user;
GRANT SELECT, INSERT, UPDATE ON actions TO app_user;
GRANT SELECT, INSERT ON action_verifications TO app_user;
