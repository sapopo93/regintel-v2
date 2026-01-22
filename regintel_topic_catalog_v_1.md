{
  "schema_version": "1.0",
  "topic_catalog_id": "topic_catalog_v1.0",
  "effective_from": "2026-01-21T00:00:00Z",
  "status": "active",
  "catalog_sha256": "sha256(canonical_topic_catalog_json)",
  "enums": {
    "domain": ["CQC", "IMMIGRATION"],
    "min_strength_required": ["weak", "supporting", "authoritative"],
    "question_plan_mode": ["evidence_first", "narrative_first", "contradiction_hunt"],
    "audit_style": ["supportive", "standard", "forensic"],
    "communication_tone": ["neutral", "firm", "coaching"],
    "evidence_type": [
      "POLICY",
      "PROCEDURE",
      "RISK_ASSESSMENT",
      "TRAINING_LOG",
      "CERTIFICATE",
      "AUDIT_REPORT",
      "MEETING_MINUTES",
      "CARE_RECORD_SAMPLE",
      "INCIDENT_LOG",
      "COMPLAINTS_LOG",
      "SAFETY_CHECKLIST",
      "EQUIPMENT_SERVICE_RECORD",
      "MEDICATION_RECORD_SAMPLE",
      "ENVIRONMENT_CHECK",
      "STAFF_ROTA_SAMPLE",
      "STAFF_FILE_SAMPLE",
      "VISITOR_LOG",
      "BUSINESS_CONTINUITY_PLAN",
      "SAFEGUARDING_REFERRAL_SAMPLE",
      "DBS_EVIDENCE",
      "RIGHT_TO_WORK_EVIDENCE",
      "SPONSORSHIP_RECORD",
      "VISA_STATUS_REPORT"
    ],
    "subject_scope": ["provider", "service", "staff_member", "staff_group", "client_sample"],
    "validity_rule": ["any", "must_be_current", "must_cover_period", "must_be_signed", "must_be_versioned"],
    "overlay": [
      "SPECIAL_MEASURES",
      "ENFORCEMENT_ACTION",
      "RATING_INADEQUATE",
      "RATING_REQUIRES_IMPROVEMENT",
      "NEW_PROVIDER",
      "REOPENED_SERVICE",
      "MERGED_SERVICE"
    ]
  },
  "topics": [
    {
      "topic_id": "SAFEGUARDING",
      "domain": "CQC",
      "title": "Safeguarding",
      "description": "Safeguarding practices, reporting, training, and governance.",
      "priority_base": 90,
      "topic_risk_weight": 1.2,
      "reg_scope_selector": {
        "regulation_keys": ["CQC:REG:SAFEGUARDING", "CQC:QS:SAFE"],
        "include_section_prefixes": ["Reg13/*", "QS/Safe/*"],
        "include_section_paths": ["Reg13/Reporting", "QS/Safe/Systems"],
        "exclude_section_prefixes": ["QS/Safe/Examples/*"],
        "exclude_section_paths": [],
        "min_strength_required": "supporting"
      },
      "evidence_hunt_profile": {
        "auto_request": [
          {"evidence_type": "POLICY", "subject_scope": "provider", "min_count": 1, "validity_rule": "must_be_versioned"},
          {"evidence_type": "TRAINING_LOG", "subject_scope": "staff_group", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "SAFEGUARDING_REFERRAL_SAMPLE", "subject_scope": "service", "min_count": 1, "validity_rule": "any"}
        ],
        "preferred_order": ["POLICY", "TRAINING_LOG", "SAFEGUARDING_REFERRAL_SAMPLE"],
        "stop_if_missing_confirmed": true,
        "evidence_weighting": {"POLICY": 0.4, "TRAINING_LOG": 0.4, "SAFEGUARDING_REFERRAL_SAMPLE": 0.2}
      },
      "conversation_templates": {
        "opening_template_id": "OPEN_SAFEGUARDING_V1",
        "transition_template_id": "TRANSITION_GENERIC_V1",
        "closing_template_id": "CLOSE_TOPIC_V1"
      },
      "question_plan": {
        "mode": "evidence_first",
        "starter_question_ids": ["Q_SG_001", "Q_SG_002"],
        "followup_question_ids": ["Q_SG_FU_010", "Q_SG_FU_011", "Q_SG_FU_012"],
        "contradiction_probe_ids": ["Q_SG_CP_001"],
        "max_repeat_per_question_id": 1
      },
      "prs_overrides": [
        {
          "when_overlay_includes_any": ["SPECIAL_MEASURES", "ENFORCEMENT_ACTION"],
          "override": {
            "audit_style": "forensic",
            "questioning_mode": "evidence_first",
            "tolerance": {"allow_vague_answers": false, "require_dates": true, "require_named_responsible_person": true, "max_followups_per_topic": 4},
            "communication_tone": "firm",
            "stop_conditions": {"stop_if_missing_evidence_confirmed": true, "stop_if_contradiction_detected": true}
          }
        }
      ],
      "signals": {
        "priority_if_missing_evidence_types": ["TRAINING_LOG", "POLICY"],
        "priority_if_recent_findings_tags": ["SAFEGUARDING"],
        "priority_multiplier_if_overlay": {"SPECIAL_MEASURES": 1.5}
      },
      "topic_hash": "sha256(canonical_topic_json)"
    },
    {
      "topic_id": "STAFFING_COMPETENCE",
      "domain": "CQC",
      "title": "Staffing & Competence",
      "description": "Recruitment, induction, competence, supervision, and training coverage.",
      "priority_base": 85,
      "topic_risk_weight": 1.15,
      "reg_scope_selector": {
        "regulation_keys": ["CQC:REG:STAFFING", "CQC:QS:EFFECTIVE"],
        "include_section_prefixes": ["Reg18/*", "QS/Effective/Staff/*"],
        "include_section_paths": ["Reg18/Training", "Reg18/Supervision"],
        "exclude_section_prefixes": [],
        "exclude_section_paths": [],
        "min_strength_required": "supporting"
      },
      "evidence_hunt_profile": {
        "auto_request": [
          {"evidence_type": "TRAINING_LOG", "subject_scope": "staff_group", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "CERTIFICATE", "subject_scope": "staff_group", "min_count": 3, "validity_rule": "must_be_current"},
          {"evidence_type": "STAFF_FILE_SAMPLE", "subject_scope": "staff_group", "min_count": 3, "validity_rule": "any"}
        ],
        "preferred_order": ["TRAINING_LOG", "STAFF_FILE_SAMPLE", "CERTIFICATE"],
        "stop_if_missing_confirmed": true,
        "evidence_weighting": {"TRAINING_LOG": 0.4, "STAFF_FILE_SAMPLE": 0.4, "CERTIFICATE": 0.2}
      },
      "conversation_templates": {
        "opening_template_id": "OPEN_STAFFING_V1",
        "transition_template_id": "TRANSITION_GENERIC_V1",
        "closing_template_id": "CLOSE_TOPIC_V1"
      },
      "question_plan": {
        "mode": "evidence_first",
        "starter_question_ids": ["Q_ST_001", "Q_ST_002"],
        "followup_question_ids": ["Q_ST_FU_010", "Q_ST_FU_011", "Q_ST_FU_012"],
        "contradiction_probe_ids": ["Q_ST_CP_001"],
        "max_repeat_per_question_id": 1
      },
      "prs_overrides": [
        {
          "when_overlay_includes_any": ["SPECIAL_MEASURES", "RATING_INADEQUATE"],
          "override": {
            "audit_style": "forensic",
            "questioning_mode": "evidence_first",
            "tolerance": {"allow_vague_answers": false, "require_dates": true, "require_named_responsible_person": true, "max_followups_per_topic": 4},
            "communication_tone": "firm",
            "stop_conditions": {"stop_if_missing_evidence_confirmed": true, "stop_if_contradiction_detected": true}
          }
        }
      ],
      "signals": {
        "priority_if_missing_evidence_types": ["TRAINING_LOG", "STAFF_FILE_SAMPLE"],
        "priority_if_recent_findings_tags": ["STAFFING_COMPETENCE"],
        "priority_multiplier_if_overlay": {"RATING_INADEQUATE": 1.4}
      },
      "topic_hash": "sha256(canonical_topic_json)"
    },
    {
      "topic_id": "MEDICINES_MANAGEMENT",
      "domain": "CQC",
      "title": "Medicines Management",
      "description": "MARs, administration, storage, audits, and errors.",
      "priority_base": 82,
      "topic_risk_weight": 1.12,
      "reg_scope_selector": {
        "regulation_keys": ["CQC:REG:SAFE_CARE", "CQC:QS:SAFE"],
        "include_section_prefixes": ["Reg12/*", "QS/Safe/Medicines/*"],
        "include_section_paths": ["Reg12/Medicines"],
        "exclude_section_prefixes": [],
        "exclude_section_paths": [],
        "min_strength_required": "supporting"
      },
      "evidence_hunt_profile": {
        "auto_request": [
          {"evidence_type": "MEDICATION_RECORD_SAMPLE", "subject_scope": "client_sample", "min_count": 3, "validity_rule": "any"},
          {"evidence_type": "AUDIT_REPORT", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "POLICY", "subject_scope": "provider", "min_count": 1, "validity_rule": "must_be_versioned"}
        ],
        "preferred_order": ["MEDICATION_RECORD_SAMPLE", "AUDIT_REPORT", "POLICY"],
        "stop_if_missing_confirmed": true,
        "evidence_weighting": {"MEDICATION_RECORD_SAMPLE": 0.5, "AUDIT_REPORT": 0.3, "POLICY": 0.2}
      },
      "conversation_templates": {
        "opening_template_id": "OPEN_MEDICINES_V1",
        "transition_template_id": "TRANSITION_GENERIC_V1",
        "closing_template_id": "CLOSE_TOPIC_V1"
      },
      "question_plan": {
        "mode": "evidence_first",
        "starter_question_ids": ["Q_MM_001", "Q_MM_002"],
        "followup_question_ids": ["Q_MM_FU_010", "Q_MM_FU_011", "Q_MM_FU_012"],
        "contradiction_probe_ids": ["Q_MM_CP_001"],
        "max_repeat_per_question_id": 1
      },
      "prs_overrides": [],
      "signals": {
        "priority_if_missing_evidence_types": ["MEDICATION_RECORD_SAMPLE", "AUDIT_REPORT"],
        "priority_if_recent_findings_tags": ["MEDICINES_MANAGEMENT"],
        "priority_multiplier_if_overlay": {"SPECIAL_MEASURES": 1.2}
      },
      "topic_hash": "sha256(canonical_topic_json)"
    },
    {
      "topic_id": "INFECTION_PREVENTION_CONTROL",
      "domain": "CQC",
      "title": "Infection Prevention & Control",
      "description": "IPC practices, cleaning schedules, audits, and training.",
      "priority_base": 80,
      "topic_risk_weight": 1.1,
      "reg_scope_selector": {
        "regulation_keys": ["CQC:REG:SAFE_CARE", "CQC:QS:SAFE"],
        "include_section_prefixes": ["Reg12/IPC/*", "QS/Safe/IPC/*"],
        "include_section_paths": ["Reg12/IPC"],
        "exclude_section_prefixes": [],
        "exclude_section_paths": [],
        "min_strength_required": "supporting"
      },
      "evidence_hunt_profile": {
        "auto_request": [
          {"evidence_type": "AUDIT_REPORT", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "TRAINING_LOG", "subject_scope": "staff_group", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "SAFETY_CHECKLIST", "subject_scope": "service", "min_count": 1, "validity_rule": "any"}
        ],
        "preferred_order": ["AUDIT_REPORT", "TRAINING_LOG", "SAFETY_CHECKLIST"],
        "stop_if_missing_confirmed": true,
        "evidence_weighting": {"AUDIT_REPORT": 0.4, "TRAINING_LOG": 0.4, "SAFETY_CHECKLIST": 0.2}
      },
      "conversation_templates": {
        "opening_template_id": "OPEN_IPC_V1",
        "transition_template_id": "TRANSITION_GENERIC_V1",
        "closing_template_id": "CLOSE_TOPIC_V1"
      },
      "question_plan": {
        "mode": "evidence_first",
        "starter_question_ids": ["Q_IPC_001", "Q_IPC_002"],
        "followup_question_ids": ["Q_IPC_FU_010", "Q_IPC_FU_011", "Q_IPC_FU_012"],
        "contradiction_probe_ids": ["Q_IPC_CP_001"],
        "max_repeat_per_question_id": 1
      },
      "prs_overrides": [],
      "signals": {
        "priority_if_missing_evidence_types": ["AUDIT_REPORT", "TRAINING_LOG"],
        "priority_if_recent_findings_tags": ["IPC"],
        "priority_multiplier_if_overlay": {"RATING_INADEQUATE": 1.2}
      },
      "topic_hash": "sha256(canonical_topic_json)"
    },
    {
      "topic_id": "GOVERNANCE_AUDIT",
      "domain": "CQC",
      "title": "Governance, Audits & Quality Assurance",
      "description": "Internal audits, quality governance, action tracking, and learning.",
      "priority_base": 78,
      "topic_risk_weight": 1.05,
      "reg_scope_selector": {
        "regulation_keys": ["CQC:REG:GOOD_GOVERNANCE", "CQC:QS:WELL_LED"],
        "include_section_prefixes": ["Reg17/*", "QS/WellLed/*"],
        "include_section_paths": ["Reg17/QA"],
        "exclude_section_prefixes": [],
        "exclude_section_paths": [],
        "min_strength_required": "authoritative"
      },
      "evidence_hunt_profile": {
        "auto_request": [
          {"evidence_type": "AUDIT_REPORT", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "MEETING_MINUTES", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "PROCEDURE", "subject_scope": "provider", "min_count": 1, "validity_rule": "must_be_versioned"}
        ],
        "preferred_order": ["AUDIT_REPORT", "MEETING_MINUTES", "PROCEDURE"],
        "stop_if_missing_confirmed": false,
        "evidence_weighting": {"AUDIT_REPORT": 0.5, "MEETING_MINUTES": 0.3, "PROCEDURE": 0.2}
      },
      "conversation_templates": {
        "opening_template_id": "OPEN_GOVERNANCE_V1",
        "transition_template_id": "TRANSITION_GENERIC_V1",
        "closing_template_id": "CLOSE_TOPIC_V1"
      },
      "question_plan": {
        "mode": "narrative_first",
        "starter_question_ids": ["Q_GOV_001", "Q_GOV_002"],
        "followup_question_ids": ["Q_GOV_FU_010", "Q_GOV_FU_011", "Q_GOV_FU_012"],
        "contradiction_probe_ids": ["Q_GOV_CP_001"],
        "max_repeat_per_question_id": 1
      },
      "prs_overrides": [
        {
          "when_overlay_includes_any": ["SPECIAL_MEASURES"],
          "override": {
            "audit_style": "forensic",
            "questioning_mode": "contradiction_hunt",
            "tolerance": {"allow_vague_answers": false, "require_dates": true, "require_named_responsible_person": true, "max_followups_per_topic": 4},
            "communication_tone": "firm",
            "stop_conditions": {"stop_if_missing_evidence_confirmed": false, "stop_if_contradiction_detected": true}
          }
        }
      ],
      "signals": {
        "priority_if_missing_evidence_types": ["AUDIT_REPORT"],
        "priority_if_recent_findings_tags": ["GOVERNANCE_AUDIT"],
        "priority_multiplier_if_overlay": {"SPECIAL_MEASURES": 1.3}
      },
      "topic_hash": "sha256(canonical_topic_json)"
    },
    {
      "topic_id": "PERSON_CENTRED_CARE_RECORDS",
      "domain": "CQC",
      "title": "Person-Centred Care & Records",
      "description": "Care planning evidence samples, record quality, and person-centred delivery.",
      "priority_base": 75,
      "topic_risk_weight": 1.0,
      "reg_scope_selector": {
        "regulation_keys": ["CQC:REG:PERSON_CENTRED_CARE", "CQC:QS:RESPONSIVE"],
        "include_section_prefixes": ["Reg9/*", "QS/Responsive/*"],
        "include_section_paths": ["Reg9/Assessments"],
        "exclude_section_prefixes": [],
        "exclude_section_paths": [],
        "min_strength_required": "supporting"
      },
      "evidence_hunt_profile": {
        "auto_request": [
          {"evidence_type": "CARE_RECORD_SAMPLE", "subject_scope": "client_sample", "min_count": 3, "validity_rule": "any"},
          {"evidence_type": "RISK_ASSESSMENT", "subject_scope": "client_sample", "min_count": 3, "validity_rule": "any"},
          {"evidence_type": "AUDIT_REPORT", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"}
        ],
        "preferred_order": ["CARE_RECORD_SAMPLE", "RISK_ASSESSMENT", "AUDIT_REPORT"],
        "stop_if_missing_confirmed": false,
        "evidence_weighting": {"CARE_RECORD_SAMPLE": 0.5, "RISK_ASSESSMENT": 0.3, "AUDIT_REPORT": 0.2}
      },
      "conversation_templates": {
        "opening_template_id": "OPEN_CARE_RECORDS_V1",
        "transition_template_id": "TRANSITION_GENERIC_V1",
        "closing_template_id": "CLOSE_TOPIC_V1"
      },
      "question_plan": {
        "mode": "evidence_first",
        "starter_question_ids": ["Q_PCC_001", "Q_PCC_002"],
        "followup_question_ids": ["Q_PCC_FU_010", "Q_PCC_FU_011", "Q_PCC_FU_012"],
        "contradiction_probe_ids": ["Q_PCC_CP_001"],
        "max_repeat_per_question_id": 1
      },
      "prs_overrides": [],
      "signals": {
        "priority_if_missing_evidence_types": ["CARE_RECORD_SAMPLE"],
        "priority_if_recent_findings_tags": ["PERSON_CENTRED_CARE_RECORDS"],
        "priority_multiplier_if_overlay": {"RATING_INADEQUATE": 1.2}
      },
      "topic_hash": "sha256(canonical_topic_json)"
    },
    {
      "topic_id": "RISK_MANAGEMENT_HEALTH_SAFETY",
      "domain": "CQC",
      "title": "Risk Management & Health/Safety",
      "description": "Risk assessments, safety checks, equipment servicing, and environment safety.",
      "priority_base": 73,
      "topic_risk_weight": 0.98,
      "reg_scope_selector": {
        "regulation_keys": ["CQC:REG:SAFE_CARE", "CQC:QS:SAFE"],
        "include_section_prefixes": ["Reg12/Risk/*", "QS/Safe/Environment/*"],
        "include_section_paths": ["Reg12/Risk"],
        "exclude_section_prefixes": [],
        "exclude_section_paths": [],
        "min_strength_required": "supporting"
      },
      "evidence_hunt_profile": {
        "auto_request": [
          {"evidence_type": "RISK_ASSESSMENT", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "EQUIPMENT_SERVICE_RECORD", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "ENVIRONMENT_CHECK", "subject_scope": "service", "min_count": 1, "validity_rule": "any"}
        ],
        "preferred_order": ["RISK_ASSESSMENT", "ENVIRONMENT_CHECK", "EQUIPMENT_SERVICE_RECORD"],
        "stop_if_missing_confirmed": false,
        "evidence_weighting": {"RISK_ASSESSMENT": 0.4, "ENVIRONMENT_CHECK": 0.3, "EQUIPMENT_SERVICE_RECORD": 0.3}
      },
      "conversation_templates": {
        "opening_template_id": "OPEN_RISK_SAFETY_V1",
        "transition_template_id": "TRANSITION_GENERIC_V1",
        "closing_template_id": "CLOSE_TOPIC_V1"
      },
      "question_plan": {
        "mode": "evidence_first",
        "starter_question_ids": ["Q_RS_001", "Q_RS_002"],
        "followup_question_ids": ["Q_RS_FU_010", "Q_RS_FU_011", "Q_RS_FU_012"],
        "contradiction_probe_ids": ["Q_RS_CP_001"],
        "max_repeat_per_question_id": 1
      },
      "prs_overrides": [],
      "signals": {
        "priority_if_missing_evidence_types": ["RISK_ASSESSMENT", "ENVIRONMENT_CHECK"],
        "priority_if_recent_findings_tags": ["RISK_MANAGEMENT_HEALTH_SAFETY"],
        "priority_multiplier_if_overlay": {"SPECIAL_MEASURES": 1.1}
      },
      "topic_hash": "sha256(canonical_topic_json)"
    },
    {
      "topic_id": "INCIDENTS_COMPLAINTS_LEARNING",
      "domain": "CQC",
      "title": "Incidents, Complaints & Learning",
      "description": "Incident management evidence, complaints handling, learning loops.",
      "priority_base": 70,
      "topic_risk_weight": 0.95,
      "reg_scope_selector": {
        "regulation_keys": ["CQC:REG:DUTY_OF_CANDOUR", "CQC:QS:WELL_LED"],
        "include_section_prefixes": ["Reg20/*", "QS/WellLed/Learning/*"],
        "include_section_paths": ["Reg20/Notifications"],
        "exclude_section_prefixes": [],
        "exclude_section_paths": [],
        "min_strength_required": "supporting"
      },
      "evidence_hunt_profile": {
        "auto_request": [
          {"evidence_type": "INCIDENT_LOG", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "COMPLAINTS_LOG", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "MEETING_MINUTES", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"}
        ],
        "preferred_order": ["INCIDENT_LOG", "COMPLAINTS_LOG", "MEETING_MINUTES"],
        "stop_if_missing_confirmed": false,
        "evidence_weighting": {"INCIDENT_LOG": 0.4, "COMPLAINTS_LOG": 0.4, "MEETING_MINUTES": 0.2}
      },
      "conversation_templates": {
        "opening_template_id": "OPEN_INCIDENTS_COMPLAINTS_V1",
        "transition_template_id": "TRANSITION_GENERIC_V1",
        "closing_template_id": "CLOSE_TOPIC_V1"
      },
      "question_plan": {
        "mode": "narrative_first",
        "starter_question_ids": ["Q_ICL_001", "Q_ICL_002"],
        "followup_question_ids": ["Q_ICL_FU_010", "Q_ICL_FU_011", "Q_ICL_FU_012"],
        "contradiction_probe_ids": ["Q_ICL_CP_001"],
        "max_repeat_per_question_id": 1
      },
      "prs_overrides": [],
      "signals": {
        "priority_if_missing_evidence_types": ["INCIDENT_LOG", "COMPLAINTS_LOG"],
        "priority_if_recent_findings_tags": ["INCIDENTS_COMPLAINTS_LEARNING"],
        "priority_multiplier_if_overlay": {"RATING_REQUIRES_IMPROVEMENT": 1.1}
      },
      "topic_hash": "sha256(canonical_topic_json)"
    },
    {
      "topic_id": "STAFFING_LEVELS",
      "domain": "CQC",
      "title": "Staffing Levels & Coverage",
      "description": "Coverage adequacy, deployment, contingency cover and escalation.",
      "priority_base": 68,
      "topic_risk_weight": 0.92,
      "reg_scope_selector": {
        "regulation_keys": ["CQC:REG:STAFFING", "CQC:QS:EFFECTIVE"],
        "include_section_prefixes": ["Reg18/Coverage/*", "QS/Effective/Coverage/*"],
        "include_section_paths": ["Reg18/Coverage"],
        "exclude_section_prefixes": [],
        "exclude_section_paths": [],
        "min_strength_required": "supporting"
      },
      "evidence_hunt_profile": {
        "auto_request": [
          {"evidence_type": "STAFF_ROTA_SAMPLE", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "RISK_ASSESSMENT", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "BUSINESS_CONTINUITY_PLAN", "subject_scope": "provider", "min_count": 1, "validity_rule": "must_be_versioned"}
        ],
        "preferred_order": ["STAFF_ROTA_SAMPLE", "RISK_ASSESSMENT", "BUSINESS_CONTINUITY_PLAN"],
        "stop_if_missing_confirmed": false,
        "evidence_weighting": {"STAFF_ROTA_SAMPLE": 0.4, "RISK_ASSESSMENT": 0.3, "BUSINESS_CONTINUITY_PLAN": 0.3}
      },
      "conversation_templates": {
        "opening_template_id": "OPEN_STAFFING_LEVELS_V1",
        "transition_template_id": "TRANSITION_GENERIC_V1",
        "closing_template_id": "CLOSE_TOPIC_V1"
      },
      "question_plan": {
        "mode": "evidence_first",
        "starter_question_ids": ["Q_SL_001", "Q_SL_002"],
        "followup_question_ids": ["Q_SL_FU_010", "Q_SL_FU_011", "Q_SL_FU_012"],
        "contradiction_probe_ids": ["Q_SL_CP_001"],
        "max_repeat_per_question_id": 1
      },
      "prs_overrides": [],
      "signals": {
        "priority_if_missing_evidence_types": ["STAFF_ROTA_SAMPLE", "BUSINESS_CONTINUITY_PLAN"],
        "priority_if_recent_findings_tags": ["STAFFING_LEVELS"],
        "priority_multiplier_if_overlay": {"SPECIAL_MEASURES": 1.1}
      },
      "topic_hash": "sha256(canonical_topic_json)"
    },
    {
      "topic_id": "LEADERSHIP_CULTURE",
      "domain": "CQC",
      "title": "Leadership & Culture",
      "description": "Leadership oversight, culture, speaking up, and staff engagement.",
      "priority_base": 65,
      "topic_risk_weight": 0.9,
      "reg_scope_selector": {
        "regulation_keys": ["CQC:QS:WELL_LED"],
        "include_section_prefixes": ["QS/WellLed/Culture/*", "QS/WellLed/Leadership/*"],
        "include_section_paths": ["QS/WellLed/Culture"],
        "exclude_section_prefixes": [],
        "exclude_section_paths": [],
        "min_strength_required": "weak"
      },
      "evidence_hunt_profile": {
        "auto_request": [
          {"evidence_type": "MEETING_MINUTES", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "AUDIT_REPORT", "subject_scope": "service", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "PROCEDURE", "subject_scope": "provider", "min_count": 1, "validity_rule": "must_be_versioned"}
        ],
        "preferred_order": ["MEETING_MINUTES", "AUDIT_REPORT", "PROCEDURE"],
        "stop_if_missing_confirmed": false,
        "evidence_weighting": {"MEETING_MINUTES": 0.4, "AUDIT_REPORT": 0.4, "PROCEDURE": 0.2}
      },
      "conversation_templates": {
        "opening_template_id": "OPEN_LEADERSHIP_CULTURE_V1",
        "transition_template_id": "TRANSITION_GENERIC_V1",
        "closing_template_id": "CLOSE_TOPIC_V1"
      },
      "question_plan": {
        "mode": "narrative_first",
        "starter_question_ids": ["Q_LC_001", "Q_LC_002"],
        "followup_question_ids": ["Q_LC_FU_010", "Q_LC_FU_011", "Q_LC_FU_012"],
        "contradiction_probe_ids": ["Q_LC_CP_001"],
        "max_repeat_per_question_id": 1
      },
      "prs_overrides": [],
      "signals": {
        "priority_if_missing_evidence_types": ["MEETING_MINUTES"],
        "priority_if_recent_findings_tags": ["LEADERSHIP_CULTURE"],
        "priority_multiplier_if_overlay": {"RATING_INADEQUATE": 1.1}
      },
      "topic_hash": "sha256(canonical_topic_json)"
    },
    {
      "topic_id": "IMMIGRATION_SPONSOR_COMPLIANCE",
      "domain": "IMMIGRATION",
      "title": "Immigration / Sponsorship Compliance",
      "description": "Sponsor licence duties, right-to-work evidence and visa status monitoring (enabled only if provider declares sponsored workforce).",
      "priority_base": 88,
      "topic_risk_weight": 1.25,
      "reg_scope_selector": {
        "regulation_keys": ["UKVI:SPONSOR:DUTIES", "UKVI:RIGHT_TO_WORK"],
        "include_section_prefixes": ["Sponsorship/Duties/*", "RTW/Checks/*"],
        "include_section_paths": ["Sponsorship/Duties/RecordKeeping", "RTW/Checks/Process"],
        "exclude_section_prefixes": [],
        "exclude_section_paths": [],
        "min_strength_required": "authoritative"
      },
      "evidence_hunt_profile": {
        "auto_request": [
          {"evidence_type": "SPONSORSHIP_RECORD", "subject_scope": "provider", "min_count": 1, "validity_rule": "must_cover_period"},
          {"evidence_type": "RIGHT_TO_WORK_EVIDENCE", "subject_scope": "staff_group", "min_count": 3, "validity_rule": "must_be_current"},
          {"evidence_type": "VISA_STATUS_REPORT", "subject_scope": "staff_group", "min_count": 1, "validity_rule": "must_cover_period"}
        ],
        "preferred_order": ["SPONSORSHIP_RECORD", "RIGHT_TO_WORK_EVIDENCE", "VISA_STATUS_REPORT"],
        "stop_if_missing_confirmed": true,
        "evidence_weighting": {"SPONSORSHIP_RECORD": 0.4, "RIGHT_TO_WORK_EVIDENCE": 0.4, "VISA_STATUS_REPORT": 0.2}
      },
      "conversation_templates": {
        "opening_template_id": "OPEN_IMMIGRATION_V1",
        "transition_template_id": "TRANSITION_GENERIC_V1",
        "closing_template_id": "CLOSE_TOPIC_V1"
      },
      "question_plan": {
        "mode": "evidence_first",
        "starter_question_ids": ["Q_IMM_001", "Q_IMM_002"],
        "followup_question_ids": ["Q_IMM_FU_010", "Q_IMM_FU_011", "Q_IMM_FU_012"],
        "contradiction_probe_ids": ["Q_IMM_CP_001"],
        "max_repeat_per_question_id": 1
      },
      "prs_overrides": [
        {
          "when_overlay_includes_any": ["ENFORCEMENT_ACTION"],
          "override": {
            "audit_style": "forensic",
            "questioning_mode": "evidence_first",
            "tolerance": {"allow_vague_answers": false, "require_dates": true, "require_named_responsible_person": true, "max_followups_per_topic": 4},
            "communication_tone": "firm",
            "stop_conditions": {"stop_if_missing_evidence_confirmed": true, "stop_if_contradiction_detected": true}
          }
        }
      ],
      "signals": {
        "priority_if_missing_evidence_types": ["RIGHT_TO_WORK_EVIDENCE", "SPONSORSHIP_RECORD"],
        "priority_if_recent_findings_tags": ["IMMIGRATION"],
        "priority_multiplier_if_overlay": {"ENFORCEMENT_ACTION": 1.5}
      },
      "domain_gate": {
        "requires_enabled_domain": "IMMIGRATION",
        "enabled_by_provider_capability_flag": "provider_capability.IMMIGRATION.enabled==true"
      },
      "topic_hash": "sha256(canonical_topic_json)"
    }
  ]
}

