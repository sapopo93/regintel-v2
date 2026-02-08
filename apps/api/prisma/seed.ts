import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

const TENANT_ID = process.env.SEED_TENANT_ID || 'demo';
const CREATED_BY = process.env.SEED_CREATED_BY || 'system-seed';
const EFFECTIVE_DATE = process.env.SEED_EFFECTIVE_DATE || '2025-01-01T00:00:00.000Z';

/**
 * CQC Fundamental Standards — Regulations 9–20
 * Health and Social Care Act 2008 (Regulated Activities) Regulations 2014
 * Source: legislation.gov.uk
 */
const REGULATIONS: Array<{
  number: number;
  title: string;
  subsections: string[];
}> = [
  { number: 9, title: 'Person-centred care', subsections: ['(1)', '(2)', '(3)'] },
  { number: 10, title: 'Dignity and respect', subsections: ['(1)', '(2)'] },
  { number: 11, title: 'Need for consent', subsections: ['(1)', '(2)', '(3)'] },
  {
    number: 12,
    title: 'Safe care and treatment',
    subsections: [
      '(1)',
      '(2)',
      '(2)(a)',
      '(2)(b)',
      '(2)(c)',
      '(2)(d)',
      '(2)(e)',
      '(2)(f)',
      '(2)(g)',
      '(2)(h)',
      '(2)(i)',
    ],
  },
  { number: 13, title: 'Safeguarding service users from abuse and improper treatment', subsections: ['(1)', '(2)', '(3)', '(4)', '(5)', '(6)', '(7)'] },
  { number: 14, title: 'Meeting nutritional and hydration needs', subsections: ['(1)', '(2)', '(3)', '(4)', '(5)', '(6)'] },
  { number: 15, title: 'Premises and equipment', subsections: ['(1)', '(2)'] },
  { number: 16, title: 'Receiving and acting on complaints', subsections: ['(1)', '(2)'] },
  { number: 17, title: 'Good governance', subsections: ['(1)', '(2)'] },
  { number: 18, title: 'Staffing', subsections: ['(1)', '(2)'] },
  { number: 19, title: 'Fit and proper persons employed', subsections: ['(1)', '(2)', '(3)'] },
  { number: 20, title: 'Duty of candour', subsections: ['(1)', '(2)', '(3)'] },
];

function hashId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

/**
 * Canonical regulation text from the Health and Social Care Act 2008
 * (Regulated Activities) Regulations 2014.
 * Top-level entries are the regulation summary; subsection entries are statutory text.
 */
const REGULATION_TEXT: Record<string, Record<string, string>> = {
  '9': {
    '': 'The care and treatment of service users must be appropriate, meet their needs and reflect their preferences.',
    '(1)': 'The care and treatment of service users must— (a) be appropriate, (b) meet their needs, and (c) reflect their preferences.',
    '(2)': 'Without limiting paragraph (1), the things which a registered person must do to comply with that paragraph include— (a) carrying out, collaboratively with the relevant person, an assessment of the needs and preferences for care and treatment of the service user.',
    '(3)': 'The registered person must have regard to— (a) the need to ensure the welfare and safety of the service user, (b) the assessment and any care or treatment plan, and (c) any guidance relating to the care and treatment for the service user\'s condition.',
  },
  '10': {
    '': 'Service users must be treated with dignity and respect.',
    '(1)': 'Service users must be treated with dignity and respect.',
    '(2)': 'Without limiting paragraph (1), the things which a registered person is required to do to comply include— (a) ensuring the privacy of the service user, (b) supporting the autonomy, independence and involvement of the service user.',
  },
  '11': {
    '': 'Care and treatment of service users must only be provided with the consent of the relevant person.',
    '(1)': 'Care and treatment of service users must only be provided with the consent of the relevant person.',
    '(2)': 'The registered person must have regard to the Mental Capacity Act 2005 and the guidance in the code of practice.',
    '(3)': 'Where a service user is over 16 but lacks capacity, the registered person must act in accordance with the 2005 Act.',
  },
  '12': {
    '': 'Care and treatment must be provided in a safe way for service users.',
    '(1)': 'Care and treatment must be provided in a safe way for service users.',
    '(2)': 'Without limiting paragraph (1), the things which a registered person must do to comply include—',
    '(2)(a)': 'assessing the risks to the health and safety of service users of receiving the care or treatment;',
    '(2)(b)': 'doing all that is reasonably practicable to mitigate any such risks;',
    '(2)(c)': 'ensuring that persons providing care or treatment to service users have the qualifications, competence, skills and experience to do so safely;',
    '(2)(d)': 'ensuring that the premises used by the service provider are safe to use for their intended purpose and are used in a safe way;',
    '(2)(e)': 'ensuring that the equipment used by the service provider for providing care or treatment is safe for such use and is used in a safe way;',
    '(2)(f)': 'where equipment or medicines are supplied, ensuring that there are sufficient quantities of these to ensure the safety of service users and meet their needs;',
    '(2)(g)': 'the proper and safe management of medicines;',
    '(2)(h)': 'assessing the risk of, and preventing, detecting and controlling the spread of, infections, including those that are health care associated;',
    '(2)(i)': 'where responsibility for the care and treatment of service users is shared, working with such other persons as are involved to ensure safe care.',
  },
  '13': {
    '': 'Service users must be protected from abuse and improper treatment.',
    '(1)': 'Service users must be protected from abuse and improper treatment in accordance with this regulation.',
    '(2)': 'Systems and processes must be established and operated effectively to prevent abuse of service users.',
    '(3)': 'Systems and processes must be established and operated effectively to investigate any allegation or evidence of abuse.',
    '(4)': 'Care or treatment must not be provided in a way that— (a) includes discrimination, (b) includes restraint unless justified, (c) includes deprivation of liberty without lawful authority.',
    '(5)': 'A service user must not be deprived of liberty for the purpose of receiving care or treatment without lawful authority.',
    '(6)': 'A person registered as a service provider must not use restraint unless it is necessary to prevent harm and is proportionate.',
    '(7)': 'For the purposes of this regulation "restraint" includes the use or threat of force, or restricting a service user\'s freedom of movement.',
  },
  '14': {
    '': 'The nutritional and hydration needs of service users must be met.',
    '(1)': 'The nutritional and hydration needs of service users must be met.',
    '(2)': 'The things which a registered person must do to comply include— ensuring adequate nutrition and hydration to sustain life and good health.',
    '(3)': 'Ensuring service users receive suitable and nutritious food and hydration which is adequate to sustain life and good health.',
    '(4)': 'Ensuring food and drink is provided to meet reasonable requirements arising from a service user\'s religious or cultural background.',
    '(5)': 'Ensuring support is provided where necessary to enable service users to eat and drink.',
    '(6)': 'Having regard to any relevant guidance on meeting nutritional and hydration needs.',
  },
  '15': {
    '': 'All premises and equipment used by the service provider must be clean, secure, suitable and properly maintained.',
    '(1)': 'All premises and equipment used by the service provider must be— (a) clean, (b) secure, (c) suitable for the purpose, (d) properly used, (e) properly maintained, and (f) appropriately located.',
    '(2)': 'The registered person must, in relation to such premises and equipment, ensure they are suitable for the purpose, used properly and maintained.',
  },
  '16': {
    '': 'Any complaint received must be investigated and necessary and proportionate action must be taken.',
    '(1)': 'Any complaint received must be investigated and necessary and proportionate action must be taken in response to any failure identified.',
    '(2)': 'The registered person must establish and operate effectively an accessible system for identifying, receiving, recording, handling and responding to complaints.',
  },
  '17': {
    '': 'Systems or processes must be established and operated effectively to ensure compliance with the requirements in this Part.',
    '(1)': 'Systems or processes must be established and operated effectively to ensure compliance with the requirements in this Part.',
    '(2)': 'Without limiting paragraph (1), such systems or processes must enable the registered person to— (a) assess, monitor and improve the quality and safety of services, (b) assess, monitor and mitigate the risks relating to the health, safety and welfare of service users.',
  },
  '18': {
    '': 'Sufficient numbers of suitably qualified, competent, skilled and experienced persons must be deployed.',
    '(1)': 'Sufficient numbers of suitably qualified, competent, skilled and experienced persons must be deployed in order to meet the requirements of this Part.',
    '(2)': 'Persons employed must— (a) receive such appropriate support, training, professional development, supervision and appraisal as is necessary.',
  },
  '19': {
    '': 'Persons employed for the purposes of carrying on a regulated activity must be fit and proper persons.',
    '(1)': 'The registered person must not employ a person for the purposes of carrying on a regulated activity unless the person is of good character.',
    '(2)': 'The registered person must not employ a person unless they have the necessary qualifications, competence, skills and experience.',
    '(3)': 'The registered person must ensure that full and satisfactory information is available in relation to persons employed, including criminal record checks.',
  },
  '20': {
    '': 'Registered persons must act in an open and transparent way with relevant persons in relation to care and treatment.',
    '(1)': 'Registered persons must act in an open and transparent way with relevant persons in relation to care and treatment provided in carrying on a regulated activity.',
    '(2)': 'As soon as reasonably practicable after becoming aware that a notifiable safety incident has occurred, the registered person must notify the relevant person.',
    '(3)': 'The notification must— (a) be given in person by a representative of the registered person, (b) provide an account of the incident, (c) offer an apology, (d) be recorded in writing.',
  },
};

function buildSections(reg: typeof REGULATIONS[number]) {
  const base = `Reg ${reg.number}`;
  const sections = [base, ...reg.subsections.map((sub) => `Reg ${reg.number}${sub}`)];
  const regText = REGULATION_TEXT[String(reg.number)] || {};

  return sections.map((sectionId) => {
    const subsectionKey = sectionId === base ? '' : sectionId.replace(`Reg ${reg.number}`, '');
    const content = regText[subsectionKey] || `${reg.title} — ${sectionId}`;
    return {
      sectionId,
      title: sectionId === base ? reg.title : `${reg.title} ${sectionId}`,
      content,
      normative: true,
    };
  });
}

function computeContentHash(title: string, sections: ReturnType<typeof buildSections>, effectiveDate: string): string {
  const canonical = {
    title,
    effectiveDate,
    sections: sections
      .map((section) => ({
        sectionId: section.sectionId,
        title: section.title,
        content: section.content,
        normative: section.normative,
      }))
      .sort((a, b) => a.sectionId.localeCompare(b.sectionId)),
  };

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

async function seedRegulations(): Promise<void> {
  const effectiveDate = new Date(EFFECTIVE_DATE);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${TENANT_ID}, true)`;

    for (const reg of REGULATIONS) {
      const regId = `cqc-reg-${reg.number}-v1`;
      const sections = buildSections(reg);
      const contentHash = computeContentHash(reg.title, sections, effectiveDate.toISOString());

      await tx.regulation.upsert({
        where: { id: regId },
        update: {
          title: reg.title,
          contentHash,
          effectiveDate,
        },
        create: {
          id: regId,
          tenantId: TENANT_ID,
          domain: 'CQC',
          version: 1,
          effectiveDate,
          supersedes: null,
          title: reg.title,
          contentHash,
          createdBy: CREATED_BY,
        },
      });

      const sectionRows = sections.map((section) => ({
        id: `section-${hashId(`${regId}:${section.sectionId}`)}`,
        tenantId: TENANT_ID,
        regulationId: regId,
        sectionId: section.sectionId,
        title: section.title,
        content: section.content,
        normative: section.normative,
      }));

      await tx.regulationSection.createMany({
        data: sectionRows,
        skipDuplicates: true,
      });
    }
  });
}

seedRegulations()
  .then(() => {
    console.log(`Seeded CQC regulations for tenant ${TENANT_ID}.`);
  })
  .catch((error) => {
    console.error('Failed to seed regulations:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
