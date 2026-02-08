-- Phase 2: Grant privileges to application role (if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'regintel_app') THEN
    GRANT USAGE ON SCHEMA public TO regintel_app;

    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      providers,
      facilities,
      provider_context_snapshots,
      mock_inspection_sessions,
      session_events,
      draft_findings,
      findings,
      evidence_blobs,
      evidence_records,
      audit_events,
      export_records,
      background_jobs,
      ai_insights,
      regulations,
      regulation_sections
    TO regintel_app;
  END IF;
END $$;
