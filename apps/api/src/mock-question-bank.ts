/**
 * Mock Question Bank — SAF-Aligned (34 Topics)
 *
 * Topic-specific questions for mock inspections aligned to the CQC
 * Single Assessment Framework (SAF) quality statements.
 *
 * Each topic maps to an ordered list of questions that progress from
 * operational to governance-level. Question counts are >= maxFollowUps + 1.
 *
 * When a topic has no bank entry, selectQuestion() falls back to a
 * generic prompt and logs a warning so the gap can be filled.
 */

export const MOCK_QUESTION_BANK: Record<string, string[]> = {
  // ──────────────────────────────────────────────────────────────────
  // SAFE (S1–S8)
  // ──────────────────────────────────────────────────────────────────

  // S1: Learning culture (5 questions, maxFollowUps=4)
  'learning-culture': [
    "Under quality statement S1, providers must foster a proactive and positive culture of safety based on openness and honesty. Walk me through your incident reporting process from the perspective of a frontline care worker on a night shift — how would they report a near miss, what happens to that report within 24 hours, and can you show me evidence that a near miss reported in the last three months led to a specific, documented practice change?",
    "Show me three recent incident investigations from the last six months. For each one, what methodology did you use — root cause analysis, contributory factor framework, or another approach? What were the findings, what actions were set, and can you evidence that those actions were completed and their effectiveness reviewed rather than simply closed?",
    "How do you ensure that learning from safety events reaches every member of staff — including bank, agency, night, and weekend workers who were not present when the learning was shared? Give me a concrete example of a lesson that was disseminated service-wide, how you verified it was understood, and how you checked three months later that practice had actually changed.",
    "Describe a situation where your being-open or duty-of-candour obligations were triggered. Walk me through the timeline — when the event occurred, when the person or family was notified, what was communicated verbally and in writing, and how you supported them through the process. What would you do differently if the same situation arose tomorrow?",
    "How does your governance structure provide assurance that the learning culture is genuinely embedded rather than performative? What data or metrics does your registered manager or board review — incident trends, near-miss-to-incident ratios, staff reporting confidence surveys — and can you give me an example where governance scrutiny of safety culture data led to a strategic decision or resource allocation change?",
  ],

  // S2: Safe systems, pathways and transitions (5 questions, maxFollowUps=4)
  'safe-systems-pathways-transitions': [
    "Under quality statement S2, you must ensure safe systems of care and manage risk during transitions. Walk me through your most recent hospital discharge admission — what information did you receive, how quickly was a post-discharge risk assessment completed, were any critical details missing from the discharge summary, and how did you manage gaps in information while keeping the person safe?",
    "When a person's care transfers between shifts, between teams, or between services, how do you ensure continuity? Show me the handover documentation from the last 48 hours — is it structured, does it capture changes in condition and outstanding actions, and how do you verify that receiving staff have read and understood it?",
    "Describe your process for managing a deteriorating resident — from initial recognition through escalation to the point where emergency services are called or the GP attends. What tools do staff use to recognise deterioration (NEWS2, RESTORE2, or equivalent), what training have they received, and can you show me a recent example where early warning scores were acted on appropriately?",
    "How do you manage the risk when someone moves between your service and another provider — for example a respite placement, a specialist hospital appointment, or a transfer to another care home? What information is shared proactively, what is your process if the receiving service does not acknowledge the handover, and how do you manage medicines reconciliation on return?",
    "How does your governance oversee the safety of care transitions across the service? What data do you track — failed discharges, readmission rates, handover quality audits, transition-related incidents — and can you give me an example where governance review of transition data led to a systemic improvement rather than a case-by-case fix?",
  ],

  // S3: Safeguarding (5 questions, maxFollowUps=4)
  'safeguarding': [
    "Under quality statement S3, you must work together with partners to understand and protect people from abuse and neglect. How many safeguarding concerns have you raised in the last twelve months, what proportion were substantiated, and what specific learning emerged from the substantiated cases? If your referral rate is very low relative to your service size, how do you satisfy yourself that concerns are being recognised rather than overlooked?",
    "Walk me through your most recent safeguarding referral — what triggered the concern, what immediate protective measures were put in place, how did you work with the local authority and other agencies, and what was the outcome? How did you ensure the person at the centre of the concern was supported and their voice heard throughout?",
    "How do you identify patterns that might indicate organisational or institutional abuse — for example a cluster of unexplained injuries, repeated use of restrictive practices, or a culture where low-level concerns are normalised? Give me a concrete example of how you investigated a potential pattern rather than treating each concern as an isolated event.",
    "What is your process when an allegation is made against a member of staff — including how you protect the person, manage the accused individual, preserve evidence, and report to relevant bodies? Walk me through a recent example or, if you have not had one, your documented procedure and how you have tested or rehearsed it.",
    "How does your governance provide oversight of safeguarding across the whole service — not just tracking referral numbers but analysing trends, themes, and the quality of your safeguarding practice? What would trigger a governance-level escalation, and how do you distinguish between a rise in referrals that signals healthy reporting and one that signals increasing risk?",
  ],

  // S4: Involving people to manage risks (5 questions, maxFollowUps=4)
  'involving-people-manage-risks': [
    "Under quality statement S4, you must involve people in managing risks to their safety. Pick three residents with different levels of cognitive ability and show me how each person was involved in their own risk assessment. What methods did you use to capture their views, how are their preferences documented, and where a person lacks capacity to contribute, how did you involve their representatives?",
    "Give me a specific example of positive risk-taking in your service — where a person wanted to do something that carried a degree of risk and you supported them to do it safely rather than defaulting to restriction. How was the decision reached, who was involved, what safeguards were put in place, and how did you document and review the outcome?",
    "How do you balance a person's autonomy and right to make unwise decisions against your duty of care? Walk me through a recent situation where these principles were in tension — for example someone declining personal care, refusing medication, or wanting to mobilise against clinical advice. How was it managed, who was consulted, and how was the decision recorded?",
    "When a person's risk profile changes — after a fall, a behavioural incident, or a deterioration in health — how do you involve them or their representatives in updating the risk assessment and agreeing new mitigations? Show me a recent example where the person's input genuinely shaped the revised plan rather than being informed after the fact.",
    "How does your governance assure itself that person-centred risk management is happening consistently across the service and not drifting towards blanket restrictions or defensive practice? What monitoring, audit, or feedback mechanisms are in place, and can you show me evidence that governance scrutiny has resulted in a shift from restrictive to enabling practice?",
  ],

  // S5: Safe environments (4 questions, maxFollowUps=3)
  'safe-environments': [
    "Under quality statement S5, the care environment must be safe, well-maintained, and suitable for its purpose. Show me your maintenance tracker and statutory compliance schedule — are all required checks current for gas safety, electrical testing, fire risk assessment, legionella, and lift inspections? If anything is overdue, what is the risk assessment and remediation plan?",
    "How do you ensure the physical environment supports people with specific needs — for example dementia-friendly design, accessibility adaptations, sensory considerations, and assistive technology? Walk me through a recent environmental adaptation you made in response to an individual's needs or a cohort change, and how you evaluated whether it made a difference.",
    "When equipment critical to care delivery fails — a hoist, profiling bed, nurse call system, or pressure-relieving mattress — what is your response process and target resolution time? Walk me through a recent equipment failure: what happened, how was risk managed in the interim, how quickly was it resolved, and was the incident recorded and reviewed?",
    "How does your governance receive assurance that the premises and equipment remain safe and fit for purpose on an ongoing basis — not just at the point of annual inspection? What data, audit results, or environmental walkround findings are reviewed, how often, and can you give me an example where governance action prevented a safety issue rather than reacting to one?",
  ],

  // S6: Safe and effective staffing (6 questions, maxFollowUps=5)
  'safe-effective-staffing': [
    "Under quality statement S6, you must ensure sufficient numbers of suitably qualified, competent, skilled, and experienced staff. How do you calculate your staffing establishment — dependency scoring, occupancy-based tool, or professional judgement? Show me how your current deployed staffing compares to the assessed need right now, and explain any variances.",
    "Walk me through your recruitment process from vacancy to first unsupervised shift. What pre-employment checks are completed — enhanced DBS, references covering the full employment history with gaps explored, right-to-work, health declaration, professional registration verification — and at what point is the person permitted to work unsupervised? Show me a recent recruitment file as evidence.",
    "How do you manage unplanned absences — sickness, no-shows, or emergencies? What is your escalation framework, at what point do you deploy agency or bank staff, and how do you ensure agency workers receive an adequate induction covering the residents they will be supporting, the premises, and emergency procedures before they begin work?",
    "What is your current vacancy rate, agency usage rate, and staff turnover rate? How have these metrics changed over the last twelve months, what does the trend tell you, and what specific actions are you taking if any indicator is moving adversely? How do you correlate staffing metrics with care quality indicators such as incident rates or complaint volumes?",
    "Describe your training, supervision, and appraisal framework. What mandatory and role-specific training is required, what is your current compliance rate, and how do you evaluate whether training has changed practice rather than just been attended? How often does each staff group receive formal supervision, and what would trigger capability management?",
    "How does your governance receive assurance that staffing is safe and effective across the whole service — including nights, weekends, and holiday periods? What staffing KPIs are reported to board or provider level, and can you give me an example where governance scrutiny of staffing data led to a strategic decision — for example changing the establishment, investing in recruitment, or changing skill mix?",
  ],

  // S7: Infection prevention and control (4 questions, maxFollowUps=3)
  'infection-prevention-control': [
    "Under quality statement S7, you must assess and manage the risk of infection. Show me the results of your last three IPC audits — what areas were covered, what tool or methodology was used, what scores were achieved, what action plans were generated, and can you evidence that actions were completed and re-audited for effectiveness?",
    "Walk me through your outbreak management plan — when was it last reviewed, and when did you last activate or test it? If you have had a recent outbreak, describe the timeline from identification through containment to debrief. If you have not, how do you know your plan would work in practice, and how do staff on all shifts know their roles?",
    "How do you ensure IPC standards are maintained consistently across all shifts — including nights, weekends, and periods of high agency usage? Specifically, how do you monitor hand hygiene compliance, correct PPE use, environmental cleaning standards, and laundry and waste segregation when senior staff are not on site?",
    "How does your governance oversee IPC performance across the service? Who receives IPC data, how frequently is it reviewed, what trends are you tracking — infection rates, antibiotic prescribing, outbreak frequency — and can you give me an example where governance scrutiny of IPC data drove a change in practice or resource allocation?",
  ],

  // S8: Medicines optimisation (5 questions, maxFollowUps=4)
  'medicines-optimisation': [
    "Under quality statement S8, medicines must be managed safely and in line with person-centred prescribing. Show me the MAR charts for three residents and your controlled drugs register. Let us check the CD balance from the last 24 hours, review the MAR charts for accuracy — gaps, omissions, handwritten amendments, or unclear entries — and confirm that any patient-specific directions are in place where required.",
    "Walk me through your most recent medicines audit — what methodology was used, what sample size, what error rate was found, and what actions resulted? How does this compare to the previous audit cycle, and can you show me evidence that actions were completed and the error rate reduced?",
    "How do you govern PRN (as-required) medicines to ensure they are not used as chemical restraint — what triggers a PRN review, how do you track frequency and effectiveness, and who is responsible for escalating patterns of high usage? For covert medication, what legal authority do you rely on, who authorises it, and how often is the decision reviewed?",
    "When a medicines administration error occurs, what is your reporting, investigation, and learning process? Give me a specific example — what was the error, what was the root cause, how was learning shared with the team, and how did you verify that practice changed? How do you manage time-critical medicines such as Parkinson's medication, insulin, or anticoagulants?",
    "How does your governance monitor medicines safety across the service? What KPIs do you track — error rates, CD discrepancies, PRN frequency trends, omitted doses, polypharmacy reviews — and when was your last medicines-focused quality assurance review at provider or board level? What did it change?",
  ],

  // ──────────────────────────────────────────────────────────────────
  // EFFECTIVE (E1–E6)
  // ──────────────────────────────────────────────────────────────────

  // E1: Assessing needs (5 questions, maxFollowUps=4)
  'assessing-needs': [
    "Under quality statement E1, you must carry out a holistic assessment of each person's needs that informs a personalised care plan. Pick a person admitted in the last three months and walk me through their initial assessment — what domains were covered, who carried it out, was multi-disciplinary input sought, and how were cultural, communication, and spiritual needs identified and recorded?",
    "How do you ensure assessments are genuinely holistic rather than a checklist exercise? Show me how you capture the person's life history, what matters to them, their strengths and capabilities, and their social and emotional needs — not just their clinical and physical requirements. How does this information translate into the care plan?",
    "When a person's needs change — after a fall, a hospital admission, a bereavement, or a gradual deterioration — what triggers a reassessment, who initiates it, and what is your target timeframe? Show me a recent example where needs were reassessed and the care plan was substantively updated as a result.",
    "How do you involve the person, their family, and other professionals in the assessment process? For people who have difficulty communicating their needs — due to dementia, learning disability, sensory impairment, or language barriers — what specific methods, tools, or specialist input do you draw on to ensure their voice informs the assessment?",
    "How does your governance assure itself that assessments are comprehensive, timely, and leading to personalised care — not just completed for compliance? What audit or quality assurance process do you use, what did the last assessment-focused audit find, and what improvements resulted?",
  ],

  // E2: Delivering evidence-based care and treatment (5 questions, maxFollowUps=4)
  'evidence-based-care': [
    "Under quality statement E2, care and treatment must be based on the best available evidence. How do you ensure your care practices align with current NICE guidelines, best practice frameworks, and clinical pathways? Give me three specific examples of guidelines that directly shape how care is delivered in this service, and show me how staff access and apply them in practice.",
    "When NICE or another authoritative body updates a guideline relevant to your service, what is your process for reviewing, implementing, and embedding the change? Walk me through a recent guideline update — what changed, how quickly was it adopted, what training was delivered, and how did you verify that practice changed on the ground?",
    "How do you measure adherence to evidence-based standards — do you audit against specific clinical pathways or guidelines, and can you show me the results? For example, if you provide dementia care, how do you evidence compliance with NICE NG97; or if you manage falls, how do you measure adherence to NICE CG161?",
    "How do you manage situations where evidence-based guidance conflicts with a person's wishes, cultural preferences, or practical constraints? Give me a specific example of how you navigated this tension and how the decision was documented.",
    "How does your governance monitor whether the service is delivering evidence-based care across all domains — not just in areas where there has been a problem? What framework do you use to stay current with emerging evidence, and can you give me an example where proactive engagement with new evidence led to an improvement before a gap was identified?",
  ],

  // E3: How staff, teams and services work together (4 questions, maxFollowUps=3)
  'staff-teams-work-together': [
    "Under quality statement E3, staff and teams must work together effectively to deliver safe, coordinated care. Describe how information flows between your care team, nursing team, activities team, and any visiting professionals during a typical 24-hour period. Show me the handover documentation from the last shift change — is it structured, does it capture changes in condition and outstanding tasks, and how do you verify that receiving staff have absorbed the information?",
    "How do you coordinate with external teams — GPs, district nurses, speech and language therapists, mental health services, pharmacists — to ensure timely and joined-up care? Give me a recent example where multi-disciplinary coordination worked well and one where it broke down. What did you learn from the failure?",
    "How do you manage information sharing between teams when a person has complex or rapidly changing needs — for example someone receiving end-of-life care, someone with challenging behaviour, or someone with multiple co-morbidities? What mechanisms ensure that all involved professionals are working from the same current information?",
    "How does your governance oversee the quality of internal and external team working? What would alert you to a breakdown in communication or coordination — and can you give me an example where governance action improved how teams work together?",
  ],

  // E4: Supporting people to live healthier lives (4 questions, maxFollowUps=3)
  'supporting-healthier-lives': [
    "Under quality statement E4, you must support people to manage their health and wellbeing and to live healthier lives. How do you proactively support health promotion — for example ensuring timely access to screening, vaccinations, dental care, optician reviews, and podiatry? Show me how you track and follow up on these appointments for your current residents.",
    "How do you assess and manage nutrition and hydration across the service? When was the last time a person was identified as at risk through MUST screening or weight monitoring, what intervention was put in place, and what was the outcome? How do you manage people with swallowing difficulties, modified diets, or specific cultural dietary requirements?",
    "How do you support people's emotional and psychological wellbeing — not just their physical health? What do you offer beyond activities — for example mental health support, access to counselling, bereavement support, or interventions for loneliness and social isolation? Give me a specific example of how you identified and responded to emotional distress.",
    "How does your governance monitor health outcomes across the service — for example weight trends, hospital admission rates, falls rates, pressure ulcer incidence, or vaccination uptake? What data is reviewed, how often, and can you show me how governance action has led to a measurable health improvement for people using the service?",
  ],

  // E5: Monitoring and improving outcomes (5 questions, maxFollowUps=4)
  'monitoring-improving-outcomes': [
    "Under quality statement E5, you must monitor and improve outcomes for people using the service. What clinical and care quality indicators do you routinely track — for example falls rates, pressure ulcer prevalence, infection rates, unplanned hospital admissions, weight loss trends, or medication errors? Show me the data for the last twelve months and explain the trends.",
    "How do you use outcome data to drive improvement rather than simply reporting it? Give me a specific example where your data identified a deteriorating trend, what investigation was carried out, what intervention was implemented, and whether the trend subsequently improved. How did you verify the improvement was sustained?",
    "How do you capture and use feedback from residents and families as an outcome measure? What methods do you use — surveys, conversations, complaints analysis, observations — and how does this qualitative data complement your quantitative indicators?",
    "How do you benchmark your outcomes against comparable services, national averages, or external standards? What benchmarks do you use, how do you perform, and what action have you taken where your outcomes are below the benchmark?",
    "How does your governance review outcome data and hold the service accountable for continuous improvement? What reporting framework is used, how frequently is it reviewed, and can you give me an example where governance challenge on outcome data led to a material change in how care is delivered?",
  ],

  // E6: Consent to care and treatment (5 questions, maxFollowUps=4)
  'consent-to-care': [
    "Under quality statement E6 and the Mental Capacity Act 2005, you must obtain valid consent before providing care and treatment. Consent is not a one-off event — show me how you revisit and re-obtain consent when a person's circumstances change. Pick a resident whose needs have changed recently and walk me through how consent was reviewed and re-documented.",
    "How do staff apply the five statutory principles of the MCA in daily practice — not just recite them? Walk me through a recent capacity assessment: what decision was it about, who initiated it, how was it recorded as decision-specific and time-specific, and what steps were taken to support the person to make the decision for themselves before concluding they lacked capacity?",
    "When a best interests decision is required, how do you evidence that all relevant parties were consulted — the person, their family, advocates, and relevant professionals? Give me a specific example, including how the person's past wishes and feelings were weighted and how the least restrictive option was identified.",
    "How do you manage DoLS or Liberty Protection Safeguards? Show me your authorisation tracker — how many people currently have authorisations in place, how many applications are pending, and how do you manage the person's care lawfully while an authorisation is awaited? For someone with conditions attached to their authorisation, show me how those conditions are being met in practice.",
    "How does your governance oversee consent and capacity practice across the service? When was your last consent-focused audit, what did it find, and what assurance do you have that capacity assessments are not being used to justify restrictive practices rather than to uphold people's rights? What training data and competency evidence supports your staff's ability to apply the MCA correctly?",
  ],

  // ──────────────────────────────────────────────────────────────────
  // CARING (C1–C5)
  // ──────────────────────────────────────────────────────────────────

  // C1: Kindness, compassion and dignity (5 questions, maxFollowUps=4)
  'kindness-compassion-dignity': [
    "Under quality statement C1, people must be treated with kindness, empathy, and compassion and their privacy and dignity must be respected. How do you ensure dignity is maintained during the highest-risk moments — personal care, toileting, continence management, moving and handling, and end-of-life care? What specific practices are in place, and how do you verify they are followed consistently across all shifts?",
    "How do you monitor that a compassionate culture is sustained during nights, weekends, and periods of high workload when management is not on the floor? What observation, feedback, or assurance mechanisms are in place — and give me a specific example of how you identified and addressed a lapse in dignity or compassion.",
    "Describe a time when you received feedback — from a resident, family member, or staff member — that someone was not being treated with dignity. What was the situation, how did you investigate, what action was taken, and how did you verify the issue was resolved and not repeated?",
    "How do you support people to maintain their identity, relationships, and personal history — including people who may be less able to advocate for themselves, such as those living with advanced dementia? Give me a specific example of how you went beyond basic care provision to preserve someone's sense of self.",
    "How does your governance oversee dignity and compassion across the service? What data or feedback do you systematically collect and review — resident surveys, family feedback, staff observations, complaint themes — and can you give me an example where governance scrutiny led to a measurable improvement in how people experience care?",
  ],

  // C2: Treating people as individuals (4 questions, maxFollowUps=3)
  'treating-people-as-individuals': [
    "Under quality statement C2, you must treat people as individuals and make sure their care and support reflects their personal needs and preferences. How do you identify and record each person's cultural background, religious observances, communication preferences, and protected characteristics — and how is this information used in daily care delivery rather than simply filed?",
    "Give me a specific example of how you adapted the service to respect a person's individuality — for example accommodating a dietary requirement linked to religious observance, adjusting routines to reflect cultural norms, or supporting a person's gender identity or sexuality. What did you do, and how did you verify the person felt respected?",
    "How do you support people whose first language is not English, who have sensory impairments, or who communicate non-verbally? What specific resources, tools, or specialist input do you use, and how do you verify that communication is effective and the person's preferences are genuinely understood?",
    "How does your governance assure itself that individual needs related to identity, culture, and communication are being met across the whole service — not just at the point of initial assessment? What monitoring, audit, or feedback mechanisms are in place, and what would alert you to a gap?",
  ],

  // C3: Independence, choice and control (4 questions, maxFollowUps=3)
  'independence-choice-control': [
    "Under quality statement C3, people must be supported to be as independent as possible and to exercise choice and control over their daily lives. How do you promote independence in practice — give me specific examples of how your service enables people to do things for themselves rather than having things done for them, even when it takes longer or involves a degree of risk?",
    "How do people exercise genuine choice in their daily routines — when they get up, when and what they eat, how they spend their time, when they go to bed? Where a person's choices conflict with operational convenience, how do you manage that tension? Give me a real example.",
    "How do you ensure access to independent advocacy for people who need it — particularly those without family involvement or those subject to restrictions? How many people currently have advocates, and how is the advocacy relationship working in practice?",
    "How does your governance monitor whether independence and choice are genuinely embedded across the service — rather than being constrained by risk aversion or task-focused routines? What would alert you to a drift towards institutionalised practice, and can you give me evidence that governance action has promoted greater independence?",
  ],

  // C4: Responding to people's immediate needs (4 questions, maxFollowUps=3)
  'responding-immediate-needs': [
    "Under quality statement C4, staff must respond to people's needs in the moment. How do you ensure timely responses to call bells, requests for assistance, and signs of distress or pain? What is your target response time, how do you monitor it, and what does your data show about actual response times across different shifts?",
    "How do staff recognise and respond to non-verbal cues — for example signs of pain, anxiety, fear, or discomfort in people who cannot easily communicate? What training have staff received, and can you give me a specific example where a staff member's attentiveness to non-verbal cues led to timely and appropriate intervention?",
    "When a person is in acute distress — pain, a fall, a behavioural crisis, or sudden deterioration — describe the immediate response process. Who responds, what clinical assessment is carried out, how is the response documented in real time, and what is the escalation pathway if the situation is beyond the competence of the staff on shift?",
    "How does your governance monitor responsiveness to immediate needs across the service? What data do you collect — call bell response times, incident timing patterns, family feedback on responsiveness — and can you give me an example where governance review identified a gap in responsiveness and drove a specific improvement?",
  ],

  // C5: Workforce wellbeing and enablement (4 questions, maxFollowUps=3)
  'workforce-wellbeing-enablement': [
    "Under quality statement C5, leaders must support the wellbeing of their workforce to enable compassionate care. What specific support do you offer for staff mental health and emotional wellbeing — beyond a generic EAP leaflet? How do you know staff are actually accessing these supports, and what take-up data can you show me?",
    "How do you monitor sickness absence, turnover, and morale across the team? What patterns have you identified in the last twelve months — are there hotspots by role, shift pattern, or team — and what targeted actions have you taken in response? How do you correlate workforce wellbeing data with care quality indicators?",
    "How do you support staff after a difficult event — a death, a safeguarding allegation, a violent or distressing incident, or a complaint against them personally? What debrief or psychological support process is in place, who leads it, and how do you ensure it reaches staff who may not ask for help?",
    "How does your governance assess whether staff wellbeing is genuinely prioritised — not just reported on as a metric? What would trigger a governance-level intervention if indicators suggested burnout, disengagement, or low morale was affecting care quality? Can you give me an example of a governance decision that was driven by workforce wellbeing data?",
  ],

  // ──────────────────────────────────────────────────────────────────
  // RESPONSIVE (R1–R7)
  // ──────────────────────────────────────────────────────────────────

  // R1: Person-centred care (5 questions, maxFollowUps=4)
  'person-centred-care': [
    "Under quality statement R1, care must be personalised and reflect what matters to each person. Pick a resident admitted in the last three months and walk me through how their care plan was developed — who was involved, how their personal history and preferences were captured, what matters to them beyond their clinical needs, and how the plan reflects their individual identity rather than a generic template.",
    "How do you ensure care plans are living documents used by staff on shift — not just files in the office or on a computer? How do staff access care plan information during care delivery, how do you verify they have read and understood the key details, and what happens when a plan is not followed?",
    "How do residents and their families genuinely shape care delivery — not just at formal review but day to day? Give me a recent example of care being adapted to reflect someone's expressed preference, including one that was inconvenient or required the service to adjust its usual approach.",
    "When a person's preferences conflict with clinical safety or the needs of other residents — for example wanting to smoke unsupervised, declining personal care, or playing loud music at night — how do you navigate that tension? Give me a specific example, including how the decision was documented and who was involved.",
    "How do you monitor whether person-centred care is consistently delivered across all shifts and all staff — not just described in plans? What observation, audit, or feedback methods do you use, and what would alert you to a drift towards task-focused rather than person-centred delivery?",
  ],

  // R2: Care provision, integration and continuity (4 questions, maxFollowUps=3)
  'care-continuity-integration': [
    "Under quality statement R2, care must be joined up, flexible, and support continuity. How do you ensure continuity of carer for your residents — do you use consistent assignment, named key workers, or another model? What proportion of shifts are covered by staff who know the residents well, and how do you manage continuity when regular staff are absent?",
    "How do you coordinate with other services involved in a person's care — GPs, community health teams, social services, specialist consultants — to ensure care is integrated rather than fragmented? Give me a recent example of effective multi-agency coordination and one where coordination failed. What was the impact and what did you learn?",
    "When a person's care needs change — either gradually or suddenly — how quickly does your service adapt? Walk me through a recent example where you needed to flex staffing, environment, or the care approach in response to changing needs. How was the change communicated to all involved staff and services?",
    "How does your governance monitor care continuity and integration across the service? What data or indicators do you track — key worker consistency, GP response times, failed referrals, readmission rates — and what would trigger a governance-level review of continuity arrangements?",
  ],

  // R3: Providing information (4 questions, maxFollowUps=3)
  'providing-information': [
    "Under quality statement R3, you must provide information in a way that people can understand. How do you comply with the Accessible Information Standard — do you identify, record, flag, share, and act on people's communication needs? Show me how a specific person's communication needs are recorded in their care record and how staff know to apply them.",
    "What formats do you make information available in — easy read, large print, translated materials, audio, digital? Give me an example of information you recently provided in an alternative format and how you ensured the person understood it. How do you manage the needs of someone who speaks no English or has a profound learning disability?",
    "How do you keep people and their families informed about changes to their care, changes to the service, or events that affect them — in a timely, proactive way rather than waiting to be asked? Give me a recent example of how you communicated a significant change, and how you checked it was understood.",
    "How does your governance oversee compliance with the Accessible Information Standard and the quality of communication across the service? What audit or monitoring has been carried out, what did it find, and what improvements resulted?",
  ],

  // R4: Listening to and involving people (5 questions, maxFollowUps=4)
  'listening-involving-people': [
    "Under quality statement R4, you must listen to and act on feedback from people, families, and staff. Walk me through your complaints procedure — how do people know how to complain, what are your response timescales, and who oversees the process? How do you distinguish between a formal complaint, an informal concern, and a safeguarding issue?",
    "Show me your complaints and concerns log for the last twelve months. How do you analyse complaints for trends and themes rather than resolving them individually? Give me an example of a recurring theme you identified and the systemic change you made as a result — not just a one-off fix.",
    "How are residents and their families involved in shaping how the service operates — not just providing feedback but genuinely influencing decisions? Give me a concrete example of a service-level change that was driven by resident or family input, and how you communicated the outcome back to them.",
    "How do you ensure involvement is genuinely inclusive — reaching people who are less vocal, have communication difficulties, or lack family advocates? What methods do you use beyond standard meetings and surveys, and how do you know these methods are effective?",
    "How does your governance monitor the effectiveness of your feedback and complaints process? What reporting is provided, how do you track whether complainants were satisfied with the outcome, and what assurance do you have that informal concerns are being captured and acted on rather than lost?",
  ],

  // R5: Equity in access (4 questions, maxFollowUps=3)
  'equity-in-access': [
    "Under quality statement R5, people must be able to access care and treatment when they need it, without facing unnecessary barriers. How do you identify and remove barriers to access — whether related to disability, language, culture, geography, digital exclusion, or other factors? Give me a specific example of a barrier you identified and the reasonable adjustment you made.",
    "How do you ensure equitable access to healthcare appointments, specialist services, and therapeutic interventions for all your residents — regardless of their background, communication ability, or level of family advocacy? What would alert you to a disparity in access?",
    "How do you monitor whether people from different backgrounds or with different characteristics have equitable access to your service and to the care within it? What data do you collect, and has this data ever revealed a gap that you needed to address?",
    "How does your governance oversee equity of access across the service? What monitoring or audit mechanisms are in place, and can you give me an example where governance action removed a barrier or improved access for a particular group?",
  ],

  // R6: Equity in experiences and outcomes (4 questions, maxFollowUps=3)
  'equity-experiences-outcomes': [
    "Under quality statement R6, you must ensure that everyone has equitable experiences and outcomes. How do you monitor whether people from different ethnic, cultural, or socioeconomic backgrounds — or with different protected characteristics — experience the same quality of care and achieve comparable outcomes?",
    "How do you listen to the experiences of people from marginalised or underrepresented groups within your service? What specific methods do you use to ensure their voices are heard, and can you give me an example of feedback from a marginalised group that led to a change in practice?",
    "When your data reveals an outcome disparity — for example higher falls rates among a particular group, lower participation in activities, or fewer family visits — how do you investigate and respond? Give me a specific example or describe the process you would follow.",
    "How does your governance oversee equity in experiences and outcomes? What data is reviewed at board or provider level, how frequently, and what would trigger a governance-level intervention to address an identified inequality?",
  ],

  // R7: Planning for the future (5 questions, maxFollowUps=4)
  'planning-for-future': [
    "Under quality statement R7, people must be supported to plan for important life changes and for the end of their lives. How do you initiate advance care planning conversations — who leads them, when are they offered, and how do you ensure they are revisited as circumstances change rather than being a one-off discussion on admission?",
    "Walk me through how you managed a recent death in the service. How were the person's documented wishes respected in their final days, how was their family supported before and after death, how was symptom management coordinated with the GP or palliative care team, and how was the care team debriefed afterwards?",
    "How do you ensure timely access to anticipatory medicines and specialist palliative care when someone is approaching end of life? What is your relationship with the local hospice or palliative care service, and can you give me an example where coordination was tested — either successfully or unsuccessfully?",
    "How do you support people through major life transitions other than end of life — for example moving into the care home, transferring between services, losing a spouse, or transitioning from one level of care to another? Give me a recent example of how you planned and supported a significant transition.",
    "How does your governance review the quality of advance care planning and end-of-life care across the service? What feedback do you seek from bereaved families, what does that feedback tell you, and how has it changed practice? What training and competency data supports your confidence that staff can deliver compassionate end-of-life care?",
  ],

  // ──────────────────────────────────────────────────────────────────
  // WELL-LED (W1–W8)
  // ──────────────────────────────────────────────────────────────────

  // W1: Shared direction and culture (4 questions, maxFollowUps=3)
  'shared-direction-culture': [
    "Under quality statement W1, you must have a shared vision and credible strategy that is understood and acted on by all staff. What are your service's vision and values, how were they developed, and how do you ensure they are understood and lived by staff at every level — not just displayed on the wall? Give me a specific example of how your values influenced a difficult operational decision.",
    "How do you embed the culture you aspire to in everyday practice? What mechanisms do you use — recruitment screening for values, supervision conversations, recognition programmes, addressing poor behaviour — and how do you know whether the culture on the floor matches the culture described in your strategy?",
    "How do you gauge whether staff understand the purpose and direction of the service? What feedback have you received — through surveys, supervision, exit interviews — and what has it told you? Where there are gaps between intended and actual culture, what action have you taken?",
    "How does your governance monitor organisational culture and ensure the vision is translated into measurable outcomes? What would alert you to a cultural drift — towards defensive practice, disengagement, or a blame culture — and how would you intervene?",
  ],

  // W2: Capable, compassionate and inclusive leaders (4 questions, maxFollowUps=3)
  'capable-compassionate-leaders': [
    "Under quality statement W2, leaders must have the skills, knowledge, and experience to lead effectively. How do you ensure that people in leadership roles — registered manager, deputy, senior carers, clinical leads — are fit and proper, competent, and developed? What ongoing leadership development do you provide beyond initial appointment?",
    "How do you evidence that each director-level individual meets the fit and proper persons requirement — including enhanced DBS, financial checks, health declarations, and declarations of interest? How often is fitness reassessed, and what would trigger an out-of-cycle review?",
    "How visible and accessible is your leadership to frontline staff and to people using the service? How do leaders stay connected to the reality of care delivery — for example through regular floor presence, direct conversations with residents, or working alongside staff? Give me a recent example.",
    "How does your governance assure itself that leadership is effective, inclusive, and compassionate — not just operationally competent? What feedback mechanisms exist for staff and residents to comment on leadership quality, and what has that feedback led to?",
  ],

  // W3: Freedom to speak up (4 questions, maxFollowUps=3)
  'freedom-to-speak-up': [
    "Under quality statement W3, people and staff must feel safe to speak up about concerns without fear of reprisal. Describe your whistleblowing and freedom-to-speak-up arrangements — who can staff raise concerns with, is there an independent route, and have you had any formal disclosures in the last twelve months? If so, what happened? If not, how do you know it is because there are no concerns rather than because people are afraid to speak?",
    "How do you actively promote a culture where speaking up is encouraged and valued — beyond having a policy? What evidence do you have that staff would actually raise a concern if they witnessed poor practice, neglect, or unsafe behaviour? Have you surveyed staff confidence in the process?",
    "When a concern is raised — formally or informally — what is your process for investigating, protecting the person who raised it, and acting on the findings? Give me a recent example of a concern raised by staff and how it was handled from start to resolution.",
    "How do you comply with the duty of candour when things go wrong? Walk me through a recent notifiable safety incident — how was it identified, how and when were the person and their family informed, what apology or explanation was given, and how did you support them through the process?",
  ],

  // W4: Workforce equality, diversity and inclusion (4 questions, maxFollowUps=3)
  'workforce-edi': [
    "Under quality statement W4, you must promote equality, diversity, and inclusion across your workforce. What workforce equality data do you collect — by ethnicity, age, disability, gender, sexuality — and what does it tell you about the composition of your workforce at different levels? Where there are disparities, what action are you taking?",
    "How do you ensure your recruitment practices are fair and free from discrimination? What steps do you take to attract a diverse candidate pool, eliminate bias in selection, and monitor outcomes by protected characteristic? Can you show me the data?",
    "How do you address discrimination, harassment, or bullying when it occurs — whether between staff, from residents or families towards staff, or vice versa? Give me a recent example of how a concern was raised, investigated, and resolved. What systemic learning came from it?",
    "How does your governance oversee EDI across the organisation? What reporting is provided at board or provider level, what targets or indicators are tracked, and can you give me an example where governance scrutiny of EDI data led to a specific action or policy change?",
  ],

  // W5: Governance, management and sustainability (6 questions, maxFollowUps=5)
  'governance-management-sustainability': [
    "Under quality statement W5, you must have clear responsibilities, roles, and systems of accountability to support good governance. Describe your governance structure — who is accountable for what, how does information flow from the floor to the board, and how does the registered manager maintain day-to-day oversight of quality and safety?",
    "How do you ensure that all required notifications to CQC are submitted without delay? What events do you understand to be notifiable, who is responsible for submissions, and can you show me your notification log for the last twelve months? Have there been any instances where a notification was delayed or missed?",
    "Walk me through your quality assurance audit programme — which domains are covered, how often, who conducts them, and how are findings acted on? Show me your most recent quality assurance report and the resulting action plan. How do you verify that actions are completed and effective?",
    "How do you assess and manage financial sustainability to ensure continuity of care? What is your current financial position, what risks exist — occupancy, commissioning changes, cost pressures — and how do you ensure that financial constraints do not compromise care quality or staffing levels?",
    "How do you manage records — both care records and corporate governance records? What system do you use, how do you ensure accuracy and contemporaneity, what are your data protection and access controls, and when was your last records audit? What did it find?",
    "How does your governance identify and manage strategic risks? Show me your risk register — what are the top three risks, who owns them, what mitigations are in place, and can you give me an example of proactive governance where a risk was identified and managed before it materialised as an incident?",
  ],

  // W6: Partnerships and communities (4 questions, maxFollowUps=3)
  'partnerships-communities': [
    "Under quality statement W6, you must work in partnership with others to deliver care that meets people's needs. Which external partners are most critical to your service — GPs, community health teams, pharmacists, local authority, voluntary organisations — and how do you maintain and evaluate those relationships? Give me a specific example of a partnership that has measurably improved care.",
    "How do you manage referrals to and from other services? What is your process for ensuring referrals are timely, appropriate, and followed up — and what happens when a referral is not acted on by the receiving service? Give me a recent example.",
    "How do you engage with the wider community to reduce isolation, promote inclusion, and connect people with local resources? Give me examples of community partnerships or activities that benefit people using your service.",
    "How does your governance oversee the quality and effectiveness of partnership working? What would alert you to a breakdown in a key relationship — for example delayed GP responses, failed discharge communications, or uncoordinated multi-agency working — and how would you escalate and resolve it?",
  ],

  // W7: Learning, improvement and innovation (5 questions, maxFollowUps=4)
  'learning-improvement-innovation': [
    "Under quality statement W7, you must be committed to continuous learning, improvement, and innovation. Describe your improvement methodology — how do you identify what needs to improve, plan and implement changes, and measure whether the improvement has been achieved and sustained? Give me a specific example of a completed improvement cycle.",
    "How do you ensure that learning from audits, incidents, complaints, and feedback translates into sustained practice change rather than one-off actions? Give me an example of a change that stuck and one that drifted back — what made the difference?",
    "How do you foster innovation in your service — are staff encouraged to suggest new approaches, and can you give me an example of a staff-led innovation that was adopted? How do you evaluate new approaches before embedding them?",
    "How do you benchmark your performance against comparable services, national standards, or sector best practice? What external benchmarks do you use, how do you perform against them, and what action have you taken where your performance falls below the benchmark?",
    "How does your governance drive a culture of learning and improvement — not just receive reports? What would trigger governance to intervene when improvement is stalling, and can you give me an example where governance challenge accelerated a stalled improvement initiative?",
  ],

  // W8: Environmental sustainability (3 questions, maxFollowUps=2)
  'environmental-sustainability': [
    "Under quality statement W8, you must understand your impact on the environment and work to reduce it. What is your approach to environmental sustainability — have you assessed your carbon footprint, energy usage, waste generation, and water consumption? What reduction targets have you set, and what progress have you made?",
    "How do you manage waste — including clinical waste, pharmaceutical waste, food waste, and general waste? What recycling and waste reduction initiatives are in place, how do you monitor compliance, and how do you ensure waste management meets regulatory requirements including duty of care for hazardous waste?",
    "How does your governance oversee environmental sustainability? Is sustainability embedded in your procurement decisions, estate management, and strategic planning — or is it a standalone initiative? What would good governance of environmental sustainability look like for your service, and how close are you to that standard?",
  ],
};

export function selectQuestion(topicId: string, questionNumber: number): string {
  const questions = MOCK_QUESTION_BANK[topicId];
  if (!questions || questions.length === 0) {
    console.warn(`[QUESTION_BANK] Topic "${topicId}" has no question bank entry — using generic fallback`);
    return `Question ${questionNumber + 1}: Please describe your processes and evidence for this inspection area.`;
  }
  const idx = Math.min(questionNumber, questions.length - 1);
  return questions[idx];
}
