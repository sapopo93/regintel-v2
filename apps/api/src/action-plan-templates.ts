/**
 * Action Plan Templates
 *
 * Defines structured remediation actions for each inspection topic.
 * Templates are auto-applied when a finding is generated from a mock inspection.
 *
 * Each template entry maps a topicId → array of ActionItemTemplate.
 * Templates are content, not logic — update when CQC guidance changes.
 *
 * Aligned to the CQC Single Assessment Framework (SAF) quality statements.
 * 34 topics across 5 key questions: Safe, Effective, Caring, Responsive, Well-Led.
 */

export interface ActionItemTemplate {
  title: string;
  description: string;
  category: 'POLICY' | 'EVIDENCE' | 'TRAINING' | 'PROCESS' | 'DOCUMENTATION';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  defaultOwner: string;
  defaultDueDays: number;
}

export const ACTION_PLAN_TEMPLATES: Record<string, ActionItemTemplate[]> = {

  // ─── SAFE (8 topics) ──────────────────────────────────────────────────────────

  'learning-culture': [
    {
      title: 'Establish safety learning framework',
      description: 'Document your organisational approach to learning from safety events. Include how near-misses, incidents, and complaints feed into practice changes, who reviews them, and how learning is disseminated to frontline staff.',
      category: 'PROCESS',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence staff engagement with safety learning',
      description: 'Provide minutes from team meetings, supervision records, or safety huddle logs showing staff actively discuss safety events and resulting changes. Include at least 3 examples from the last quarter.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Implement just culture training',
      description: 'Deliver training on just culture principles to all staff, covering the difference between human error, at-risk behaviour, and reckless conduct. Retain attendance records and evaluation feedback.',
      category: 'TRAINING',
      priority: 'MEDIUM',
      defaultOwner: 'HR Manager',
      defaultDueDays: 30,
    },
  ],

  'safe-systems-pathways-transitions': [
    {
      title: 'Map care transition pathways',
      description: 'Document all care transition points (admission, hospital transfer, discharge, inter-service referral) with named leads, checklists, and communication protocols for each pathway.',
      category: 'PROCESS',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 14,
    },
    {
      title: 'Provide transition safety audit evidence',
      description: 'Conduct and upload an audit of the last 10 care transitions, checking information accuracy, timeliness of handover, medication reconciliation, and follow-up actions completed.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 21,
    },
    {
      title: 'Upload multi-agency communication records',
      description: 'Provide evidence of effective communication with external partners (GPs, hospitals, social workers) during transitions — redacted referral letters, discharge summaries, or shared care records.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 14,
    },
  ],

  'safeguarding': [
    {
      title: 'Upload safeguarding policy and procedures',
      description: 'Your current safeguarding adults and children policy, including the designated safeguarding lead, escalation flowchart, local authority referral contacts, and review date.',
      category: 'POLICY',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 7,
    },
    {
      title: 'Evidence safeguarding training compliance',
      description: 'Provide a training matrix showing all staff have completed safeguarding training at the appropriate level (Level 1 for all staff, Level 2+ for leads). Include completion dates and renewal schedule.',
      category: 'TRAINING',
      priority: 'HIGH',
      defaultOwner: 'HR Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Provide safeguarding referral log',
      description: 'Upload your safeguarding concerns log for the last 12 months showing referrals made to the local authority, outcomes received, and internal actions taken in response.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
  ],

  'involving-people-manage-risks': [
    {
      title: 'Evidence person-centred risk assessments',
      description: 'Provide 3 recent individual risk assessments (redacted) demonstrating how the person and/or their representative was involved in identifying risks and agreeing mitigation strategies.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 14,
    },
    {
      title: 'Upload positive risk-taking policy',
      description: 'Your policy on supporting people to take positive risks, balancing safety with autonomy. Include decision-making frameworks and how capacity is considered.',
      category: 'POLICY',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Document risk communication with families',
      description: 'Provide evidence of how risks are communicated to people using the service and their families — meeting notes, written risk summaries shared, or consent forms for agreed risk plans.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 21,
    },
  ],

  'safe-environments': [
    {
      title: 'Upload environmental risk assessment',
      description: 'Your premises risk assessment covering fire safety, legionella, COSHH, electrical safety, and accessibility. Include the date of last review and named responsible person.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 7,
    },
    {
      title: 'Provide maintenance and safety check records',
      description: 'Upload records of routine maintenance checks for the last 6 months — fire alarm tests, emergency lighting, PAT testing, lift inspections, and water temperature monitoring.',
      category: 'DOCUMENTATION',
      priority: 'HIGH',
      defaultOwner: 'Maintenance Lead',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence infection control environmental audits',
      description: 'Provide completed environmental cleanliness audits with scores, action plans for areas below threshold, and evidence of re-audit showing improvement.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 21,
    },
  ],

  'safe-effective-staffing': [
    {
      title: 'Upload recruitment and pre-employment check records',
      description: 'Provide your recruitment policy and evidence of pre-employment checks for the last 5 staff recruited — DBS certificates, references, right to work, professional registration verification, and interview records.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'HR Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence mandatory and specialist training compliance',
      description: 'Provide a full training matrix showing compliance rates for mandatory training (moving and handling, fire safety, first aid, safeguarding, MCA/DoLS) and specialist training relevant to service user needs. Target ≥90% compliance.',
      category: 'TRAINING',
      priority: 'HIGH',
      defaultOwner: 'HR Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Provide supervision and appraisal records',
      description: 'Upload supervision schedule and sample records (minimum 3) showing regular one-to-one supervision with reflective practice, competency assessment, and development goals. Include annual appraisal completion rates.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Upload workforce planning and staffing dependency tool',
      description: 'Provide your staffing dependency tool or needs analysis showing how staffing levels are determined based on acuity, occupancy, and skill mix. Include rotas for the last 4 weeks showing planned vs actual staffing.',
      category: 'PROCESS',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
  ],

  'infection-prevention-control': [
    {
      title: 'Upload IPC policy and annual programme',
      description: 'Your infection prevention and control policy, IPC lead details, and annual IPC audit programme. Include outbreak management plan and antimicrobial stewardship approach.',
      category: 'POLICY',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 7,
    },
    {
      title: 'Evidence IPC audit results and actions',
      description: 'Provide the last 3 IPC audit reports with action plans, completion evidence, and trend analysis. Include hand hygiene audit results and PPE compliance observations.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 14,
    },
    {
      title: 'Provide IPC training and competency records',
      description: 'Upload IPC training completion records for all staff and competency assessments for clinical staff on aseptic technique, specimen collection, and PPE use.',
      category: 'TRAINING',
      priority: 'MEDIUM',
      defaultOwner: 'HR Manager',
      defaultDueDays: 21,
    },
  ],

  'medicines-optimisation': [
    {
      title: 'Upload medicines management policy',
      description: 'Your medicines policy covering ordering, receipt, storage, administration, disposal, controlled drugs, covert administration, and self-administration. Include the date of last review.',
      category: 'POLICY',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 7,
    },
    {
      title: 'Evidence medicines audit and error tracking',
      description: 'Provide the last 3 months of medicines audits, MAR chart checks, controlled drugs register reconciliation, and a log of medicines errors with root cause analysis and actions taken.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 14,
    },
    {
      title: 'Provide medicines competency assessment records',
      description: 'Upload competency assessment records for all staff who administer medicines, including observed practice assessments, knowledge tests, and reassessment dates.',
      category: 'TRAINING',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 14,
    },
  ],

  // ─── EFFECTIVE (6 topics) ──────────────────────────────────────────────────────

  'assessing-needs': [
    {
      title: 'Upload pre-admission assessment template and examples',
      description: 'Provide your pre-admission assessment framework and 3 completed assessments (redacted) showing holistic needs evaluation covering physical, mental, social, cultural, and spiritual needs.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence ongoing needs reassessment process',
      description: 'Document your process for regular reassessment of needs, including triggers for unplanned reassessment. Provide 3 examples showing how care plans were updated following reassessment.',
      category: 'PROCESS',
      priority: 'HIGH',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 14,
    },
    {
      title: 'Provide equality and diversity needs assessment records',
      description: 'Evidence how protected characteristics and cultural needs are captured during assessment and reflected in care planning — dietary requirements, communication needs, religious observance, gender identity.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 21,
    },
  ],

  'evidence-based-care': [
    {
      title: 'Document use of evidence-based frameworks',
      description: 'Provide evidence of NICE guidelines, best practice frameworks, or peer-reviewed approaches referenced in your care delivery. Map at least 5 clinical or care practices to their evidence base.',
      category: 'DOCUMENTATION',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence clinical governance and practice review',
      description: 'Upload records of clinical governance meetings, case reviews, or practice discussions where evidence-based guidance was reviewed and applied to improve care delivery.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 21,
    },
    {
      title: 'Provide staff access to current guidance',
      description: 'Evidence that staff have access to up-to-date clinical guidance and best practice resources — subscription records, reference library, intranet resources, or digital access to NICE guidelines.',
      category: 'PROCESS',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
  ],

  'staff-teams-work-together': [
    {
      title: 'Evidence multidisciplinary team working',
      description: 'Provide minutes or records from multidisciplinary team meetings, case conferences, or joint assessments showing effective collaboration between different professionals involved in care delivery.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 14,
    },
    {
      title: 'Upload handover and communication protocols',
      description: 'Your shift handover procedure and communication tools (SBAR, structured handover templates). Provide 3 completed handover records demonstrating consistent information transfer.',
      category: 'PROCESS',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence external professional collaboration',
      description: 'Provide records of engagement with visiting professionals (GPs, district nurses, therapists, pharmacists) including visit logs, agreed actions, and follow-up completion evidence.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 21,
    },
  ],

  'supporting-healthier-lives': [
    {
      title: 'Upload health promotion programme evidence',
      description: 'Provide details of health promotion activities offered — falls prevention, nutrition and hydration programmes, exercise groups, flu vaccination uptake, oral health support, smoking cessation referrals.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 21,
    },
    {
      title: 'Evidence health screening and monitoring',
      description: 'Provide records showing routine health monitoring — weight tracking, skin integrity checks, nutritional screening (MUST tool), dental and optical referrals, and annual health checks.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 14,
    },
    {
      title: 'Document wellbeing outcome tracking',
      description: 'Evidence how you measure and track health and wellbeing outcomes for people using the service. Include any outcome tools used and examples of how data has driven improvements.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
  ],

  'monitoring-improving-outcomes': [
    {
      title: 'Upload outcome monitoring framework',
      description: 'Document your approach to measuring care outcomes including KPIs tracked, data collection methods, analysis frequency, and how results are benchmarked against sector standards.',
      category: 'PROCESS',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Provide outcome data and trend analysis',
      description: 'Upload outcome data for the last 6 months — falls rates, pressure ulcer incidence, medication errors, hospital admissions, weight loss, safeguarding referrals — with trend analysis and actions taken.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 21,
    },
    {
      title: 'Evidence outcome-driven care plan changes',
      description: 'Provide 3 examples (redacted) showing how outcome monitoring data led to specific changes in individual care plans or service-wide practice improvements.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 21,
    },
  ],

  'consent-to-care': [
    {
      title: 'Upload consent policy and practice evidence',
      description: 'Your consent policy covering informed consent, refusal of care, and withdrawal of consent. Provide 3 examples of consent being obtained and documented, including for people with communication needs.',
      category: 'POLICY',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 7,
    },
    {
      title: 'Evidence Mental Capacity Act compliance',
      description: 'Provide your MCA policy, staff MCA training records, and 3 completed capacity assessments (redacted) demonstrating the two-stage test, decision-specific approach, and all practicable steps taken to support decision-making.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 14,
    },
    {
      title: 'Maintain DoLS/LPS authorisation tracker',
      description: 'Upload your Deprivation of Liberty Safeguards (or Liberty Protection Safeguards) tracker showing all applications made, authorisation status, conditions, review dates, and relevant person representative details.',
      category: 'DOCUMENTATION',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Provide best interests decision records',
      description: 'Upload 3 completed best interests decision records (redacted) showing proper consultation with relevant parties, consideration of the person\'s wishes and feelings, and the least restrictive option selected.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 14,
    },
  ],

  // ─── CARING (5 topics) ────────────────────────────────────────────────────────

  'kindness-compassion-dignity': [
    {
      title: 'Upload dignity and respect policy',
      description: 'Your policy on promoting dignity, privacy, and respect in care delivery. Include practical guidance on personal care, mealtimes, visiting, and communication.',
      category: 'POLICY',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 7,
    },
    {
      title: 'Evidence dignity observations and audits',
      description: 'Provide completed dignity audits or SOFI (Short Observational Framework for Inspection) style observations from the last 3 months. Include action plans for any concerns identified.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Provide feedback evidencing compassionate care',
      description: 'Upload compliments, thank you cards, survey responses, or family feedback from the last 6 months that evidence compassionate, kind care delivery. Include how positive practice is recognised and shared.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
  ],

  'treating-people-as-individuals': [
    {
      title: 'Evidence personalised care planning',
      description: 'Provide 3 care plans (redacted) demonstrating person-centred approaches — life history, personal preferences, cultural needs, communication requirements, and how the person\'s voice is captured.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 14,
    },
    {
      title: 'Upload equality and human rights training records',
      description: 'Provide training records showing all staff have completed equality, diversity, and human rights training. Include how the service meets protected characteristic needs.',
      category: 'TRAINING',
      priority: 'MEDIUM',
      defaultOwner: 'HR Manager',
      defaultDueDays: 21,
    },
    {
      title: 'Document cultural and spiritual care provision',
      description: 'Evidence how cultural, religious, and spiritual needs are identified, recorded, and met — dietary provisions, prayer space, cultural celebrations, interpreter access, and community links.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 21,
    },
  ],

  'independence-choice-control': [
    {
      title: 'Evidence promotion of independence in daily living',
      description: 'Provide 3 examples (redacted) showing how people are supported to maintain or develop independence — rehabilitation goals, daily living skills, assistive technology, and enablement approaches.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 14,
    },
    {
      title: 'Document choice and control mechanisms',
      description: 'Evidence the choices available to people using the service — meal menus with options, activity programmes, daily routine flexibility, room personalisation, and how preferences are captured and honoured.',
      category: 'DOCUMENTATION',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Upload advocacy and self-advocacy support records',
      description: 'Provide details of advocacy services available, how people are informed of their right to an advocate, and examples of advocacy being facilitated or self-advocacy being supported.',
      category: 'PROCESS',
      priority: 'MEDIUM',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 21,
    },
  ],

  'responding-immediate-needs': [
    {
      title: 'Upload emergency and escalation procedures',
      description: 'Your procedures for responding to medical emergencies, deteriorating health, behavioural crises, and environmental emergencies. Include escalation pathways, on-call arrangements, and out-of-hours support.',
      category: 'PROCESS',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 7,
    },
    {
      title: 'Evidence timely response monitoring',
      description: 'Provide call bell or response time audit data showing how quickly staff respond to requests for assistance. Include analysis of patterns, any delays, and actions taken to improve response times.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Provide emergency training and drill records',
      description: 'Upload records of emergency response training (first aid, BLS, choking, fire evacuation) and drill completion logs. Include staff competency assessments and debrief notes.',
      category: 'TRAINING',
      priority: 'HIGH',
      defaultOwner: 'HR Manager',
      defaultDueDays: 14,
    },
  ],

  'workforce-wellbeing-enablement': [
    {
      title: 'Upload staff wellbeing strategy',
      description: 'Your staff wellbeing programme covering mental health support, occupational health access, employee assistance programme, flexible working, and anti-bullying measures.',
      category: 'POLICY',
      priority: 'MEDIUM',
      defaultOwner: 'HR Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence staff satisfaction and retention metrics',
      description: 'Provide staff survey results, turnover rates, sickness absence data, and exit interview themes from the last 12 months. Include actions taken in response to findings.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'HR Manager',
      defaultDueDays: 21,
    },
    {
      title: 'Document enablement and development support',
      description: 'Evidence how staff are supported to deliver high-quality care — access to resources, time for development, peer support networks, debrief opportunities after difficult situations.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
  ],

  // ─── RESPONSIVE (7 topics) ────────────────────────────────────────────────────

  'person-centred-care': [
    {
      title: 'Upload person-centred care policy and framework',
      description: 'Your person-centred care policy describing how care is tailored to individual needs, preferences, and goals. Include your care planning methodology and how people\'s voices are captured.',
      category: 'POLICY',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 7,
    },
    {
      title: 'Evidence person-centred care plan reviews',
      description: 'Provide 3 care plan reviews (redacted) showing the person and/or their representative participated, personal goals were reviewed, and the plan was updated to reflect changing needs and preferences.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 14,
    },
    {
      title: 'Provide activity and engagement programme evidence',
      description: 'Upload your activity programme showing how it is personalised to individuals\' interests, abilities, and preferences. Include participation records and evidence of how activities are adapted.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'Activities Coordinator',
      defaultDueDays: 21,
    },
  ],

  'care-continuity-integration': [
    {
      title: 'Document care continuity protocols',
      description: 'Upload your protocols for maintaining care continuity during staff changes, shift patterns, annual leave, and agency use. Include how key worker relationships are maintained and handover quality is assured.',
      category: 'PROCESS',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence integrated care coordination',
      description: 'Provide records demonstrating coordination with health and social care partners — shared care plans, professional liaison records, and how information from external assessments is incorporated into care delivery.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 21,
    },
    {
      title: 'Upload service user journey mapping',
      description: 'Document the typical service user journey from referral to ongoing care, identifying key touchpoints, responsible professionals, and how continuity is maintained through transitions.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 21,
    },
  ],

  'providing-information': [
    {
      title: 'Upload accessible information standards compliance',
      description: 'Evidence compliance with the Accessible Information Standard — how communication needs are identified, recorded, flagged, shared, and met. Include examples of information provided in alternative formats.',
      category: 'PROCESS',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Provide service information pack',
      description: 'Upload the information pack provided to new and prospective service users — service guide, terms of engagement, complaints procedure, key contacts, and how to provide feedback. Show it is available in accessible formats.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence communication support provision',
      description: 'Provide examples of communication aids, interpreter services, easy-read documents, or assistive technology used to ensure people can access and understand information about their care.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 21,
    },
  ],

  'listening-involving-people': [
    {
      title: 'Upload complaints policy and handling evidence',
      description: 'Your complaints policy with timescales for acknowledgement and response. Provide a complaints log for the last 12 months showing each complaint, investigation, outcome, learning, and confirmation the complainant was informed.',
      category: 'PROCESS',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 7,
    },
    {
      title: 'Evidence resident and family involvement mechanisms',
      description: 'Provide records of residents\' meetings, relatives\' meetings, surveys, or other involvement forums from the last 6 months. Include agendas, minutes, feedback received, and changes made as a result.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Document feedback loop and you-said-we-did',
      description: 'Evidence a visible feedback loop — "You Said, We Did" boards, newsletter updates, or written responses showing how service user and family feedback has directly led to changes in the service.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
  ],

  'equity-in-access': [
    {
      title: 'Upload equitable access policy',
      description: 'Your policy on ensuring equitable access to care regardless of protected characteristics, socioeconomic status, or geography. Include how you identify and address barriers to accessing your service.',
      category: 'POLICY',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence accessibility provisions',
      description: 'Provide evidence of physical, communication, and digital accessibility measures in place — building adaptations, assistive technology, translation services, sensory aids, and reasonable adjustments made.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Document waiting time and access monitoring',
      description: 'Upload data on referral-to-assessment times, waiting lists, and any monitoring of equitable access across different demographic groups. Include actions taken to address disparities.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Care Coordinator',
      defaultDueDays: 21,
    },
  ],

  'equity-experiences-outcomes': [
    {
      title: 'Evidence equitable outcomes monitoring',
      description: 'Provide data analysis showing care outcomes disaggregated by relevant demographic factors. Include actions taken where disparities in experience or outcomes are identified.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
    {
      title: 'Upload equality impact assessments',
      description: 'Provide equality impact assessments for key policies, service changes, or care pathways showing how potential differential impact on protected groups was considered and mitigated.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
    {
      title: 'Document inclusive practice training',
      description: 'Evidence staff training on health inequalities, unconscious bias, cultural competence, and inclusive practice. Include how learning is applied in day-to-day care delivery.',
      category: 'TRAINING',
      priority: 'MEDIUM',
      defaultOwner: 'HR Manager',
      defaultDueDays: 30,
    },
  ],

  'planning-for-future': [
    {
      title: 'Upload advance care planning policy and records',
      description: 'Your advance care planning policy and 3 examples (redacted) of advance care plans, advance decisions to refuse treatment, or lasting power of attorney records. Show how plans are regularly reviewed.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence end-of-life care planning',
      description: 'Provide evidence of end-of-life care planning including preferred priorities for care, DNACPR documentation, syringe driver competencies, and links with palliative care services.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Clinical Lead',
      defaultDueDays: 14,
    },
    {
      title: 'Document bereavement and after-death care',
      description: 'Your procedures for after-death care, bereavement support for other residents and staff, and how the wishes documented in advance care plans were honoured. Include family feedback where available.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
  ],

  // ─── WELL-LED (8 topics) ──────────────────────────────────────────────────────

  'shared-direction-culture': [
    {
      title: 'Upload vision, values, and strategy document',
      description: 'Your organisational vision, values, and strategic objectives. Include evidence of how these are communicated to staff and people using the service, and how they inform decision-making.',
      category: 'DOCUMENTATION',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence organisational culture assessment',
      description: 'Provide evidence of how organisational culture is assessed and shaped — culture surveys, values-based recruitment, staff recognition programmes, and leadership visibility activities.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
    {
      title: 'Document staff engagement with vision and values',
      description: 'Upload evidence that staff understand and embody the organisational values — induction materials, team meeting discussions, supervision records referencing values, and staff feedback on culture.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'HR Manager',
      defaultDueDays: 21,
    },
  ],

  'capable-compassionate-leaders': [
    {
      title: 'Upload leadership structure and development programme',
      description: 'Your organisational structure chart, role descriptions for leadership positions, and leadership development programme. Include succession planning and how leadership capability is assessed.',
      category: 'DOCUMENTATION',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence visible and accessible leadership',
      description: 'Provide evidence of leadership visibility and accessibility — open door policies, leadership walkabouts, management availability records, and how leaders engage with people using the service.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
    {
      title: 'Provide leadership feedback and 360 review records',
      description: 'Upload anonymised leadership feedback, 360-degree reviews, or management supervision records showing how leaders are held accountable and develop their competence.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'HR Manager',
      defaultDueDays: 21,
    },
  ],

  'freedom-to-speak-up': [
    {
      title: 'Upload whistleblowing and freedom to speak up policy',
      description: 'Your freedom to speak up (FTSU) policy including the named FTSU guardian/champion, reporting channels, protection for whistleblowers, and how concerns are investigated and fed back.',
      category: 'POLICY',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 7,
    },
    {
      title: 'Evidence speaking up culture',
      description: 'Provide evidence that staff feel confident to raise concerns — anonymised staff survey results on psychological safety, speaking up training records, and a log of concerns raised with outcomes.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Document speaking up awareness activities',
      description: 'Upload evidence of speaking up awareness activities — National Speak Up Month participation, poster campaigns, team meeting discussions, and FTSU champion training and visibility.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'HR Manager',
      defaultDueDays: 21,
    },
  ],

  'workforce-edi': [
    {
      title: 'Upload workforce equality, diversity, and inclusion policy',
      description: 'Your EDI policy covering recruitment, promotion, pay equity, reasonable adjustments, and anti-discrimination. Include workforce diversity data and your EDI action plan.',
      category: 'POLICY',
      priority: 'HIGH',
      defaultOwner: 'HR Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence workforce diversity monitoring',
      description: 'Provide workforce diversity data across protected characteristics, including analysis of representation at different levels, pay gap data, and recruitment/retention by demographic group.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'HR Manager',
      defaultDueDays: 21,
    },
    {
      title: 'Provide EDI training and awareness records',
      description: 'Upload EDI training completion records for all staff, including unconscious bias training for recruiting managers. Include how EDI is embedded in induction and ongoing development.',
      category: 'TRAINING',
      priority: 'MEDIUM',
      defaultOwner: 'HR Manager',
      defaultDueDays: 30,
    },
  ],

  'governance-management-sustainability': [
    {
      title: 'Upload governance structure and oversight framework',
      description: 'Your governance framework showing board/management oversight structure, meeting frequency, standing agenda items, escalation routes, and how quality and safety are monitored at each level.',
      category: 'PROCESS',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence CQC notification compliance',
      description: 'Provide your CQC notification log for the last 12 months showing all statutory notifications submitted within required timescales. Include the process for identifying notifiable events and who is responsible.',
      category: 'DOCUMENTATION',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 7,
    },
    {
      title: 'Upload financial sustainability and business continuity plans',
      description: 'Provide your financial sustainability plan including budget forecasts, occupancy projections, and contingency planning. Include your business continuity plan covering staffing crises, IT failure, and major incidents.',
      category: 'DOCUMENTATION',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
    {
      title: 'Conduct records management audit',
      description: 'Perform and upload a records management audit covering data protection compliance, record retention schedules, information security measures, subject access request processes, and staff data protection training.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
  ],

  'partnerships-communities': [
    {
      title: 'Upload partnership and stakeholder engagement plan',
      description: 'Your plan for engaging with local partners — ICBs, local authorities, voluntary sector, community groups, and Healthwatch. Include named contacts, meeting schedules, and shared initiatives.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
    {
      title: 'Evidence community integration activities',
      description: 'Provide evidence of how people using the service are supported to maintain community connections — community outings, visiting programmes, intergenerational projects, and local group participation.',
      category: 'EVIDENCE',
      priority: 'MEDIUM',
      defaultOwner: 'Activities Coordinator',
      defaultDueDays: 21,
    },
    {
      title: 'Document collaborative service improvement',
      description: 'Evidence of service improvements resulting from partnership working — joint training, shared learning events, collaborative audits, or service redesign with partner organisations.',
      category: 'EVIDENCE',
      priority: 'LOW',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 30,
    },
  ],

  'learning-improvement-innovation': [
    {
      title: 'Upload quality audit programme and results',
      description: 'Your annual quality audit programme showing scheduled audits, completed audits with scores, action plans, and re-audit evidence. Include clinical and non-clinical audits across all key quality areas.',
      category: 'PROCESS',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Evidence learning from incidents and complaints',
      description: 'Provide a learning log showing how incidents, complaints, near-misses, and safeguarding concerns are analysed for themes and translated into practice changes. Include communication of learning to all staff.',
      category: 'EVIDENCE',
      priority: 'HIGH',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 14,
    },
    {
      title: 'Document continuous improvement and innovation initiatives',
      description: 'Evidence of quality improvement projects, innovation pilots, or service development initiatives undertaken. Include methodology used, outcomes measured, and how successful improvements are sustained.',
      category: 'DOCUMENTATION',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
  ],

  'environmental-sustainability': [
    {
      title: 'Upload environmental sustainability policy',
      description: 'Your environmental sustainability policy covering energy efficiency, waste reduction, water conservation, sustainable procurement, and carbon footprint reduction targets.',
      category: 'POLICY',
      priority: 'MEDIUM',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 21,
    },
    {
      title: 'Evidence sustainable practice implementation',
      description: 'Provide records of sustainability actions taken — energy audit results, waste segregation and recycling data, reduced single-use plastic measures, and sustainable procurement decisions.',
      category: 'EVIDENCE',
      priority: 'LOW',
      defaultOwner: 'Maintenance Lead',
      defaultDueDays: 30,
    },
    {
      title: 'Document environmental impact monitoring',
      description: 'Upload monitoring data showing progress against sustainability targets — energy consumption trends, waste volumes, water usage, and any environmental certifications or awards achieved.',
      category: 'DOCUMENTATION',
      priority: 'LOW',
      defaultOwner: 'Registered Manager',
      defaultDueDays: 30,
    },
  ],
};
