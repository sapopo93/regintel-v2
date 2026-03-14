/**
 * DOCX Renderer — docx-based Word document generation for all report types.
 *
 * Presentation concern only. Takes domain data structures, returns Buffer.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  AlignmentType,
  HeadingLevel,
  WidthType,
  BorderStyle,
  ShadingType,
} from 'docx';
import type { RenderOutput } from './renderer-types.js';
import type { PdfExport } from '@regintel/domain/readiness-export';
import type { InspectorEvidencePack } from '@regintel/domain/inspector-evidence-pack';
import type { BlueOceanReport } from '@regintel/domain/blue-ocean-report';

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Strips tenant prefix from scoped keys for display.
 * "user_3AIES…:session-11" → "session-11"
 */
function displayId(scopedId: string): string {
  const colonIdx = scopedId.indexOf(':');
  return colonIdx >= 0 ? scopedId.slice(colonIdx + 1) : scopedId;
}

interface MetaInfo {
  topicCatalogVersion: string;
  topicCatalogHash: string;
  prsLogicVersion: string;
  prsLogicHash: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'D32F2F';
    case 'HIGH': return 'E65100';
    case 'MEDIUM': return 'F9A825';
    case 'LOW': return '2E7D32';
    default: return '333333';
  }
}

function makeHeader(watermark: string | null): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: watermark ?? '',
            color: '999999',
            size: 16,
            italics: true,
          }),
        ],
      }),
    ],
  });
}

function makeFooter(meta: MetaInfo): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Topic Catalog: ${meta.topicCatalogVersion} (${meta.topicCatalogHash}) | PRS Logic: ${meta.prsLogicVersion} (${meta.prsLogicHash})`,
            color: 'AAAAAA',
            size: 12,
          }),
        ],
      }),
    ],
  });
}

function heading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1): Paragraph {
  return new Paragraph({ text, heading: level });
}

function bodyText(text: string, color?: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, color: color ?? '333333', size: 20 })],
    spacing: { after: 100 },
  });
}

function boldText(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: label, bold: true, size: 20 }),
      new TextRun({ text: value, size: 20 }),
    ],
    spacing: { after: 80 },
  });
}

function bulletItem(text: string, color?: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, color: color ?? '333333', size: 18 })],
    bullet: { level: 0 },
    spacing: { after: 40 },
  });
}

function emptyParagraph(): Paragraph {
  return new Paragraph({ children: [] });
}

function simpleTableRow(cells: string[], headerRow = false): TableRow {
  return new TableRow({
    children: cells.map(
      (text) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text,
                  bold: headerRow,
                  color: headerRow ? 'FFFFFF' : '333333',
                  size: 18,
                }),
              ],
            }),
          ],
          shading: headerRow
            ? { type: ShadingType.SOLID, color: '1A237E' }
            : undefined,
        })
    ),
  });
}

async function packDoc(doc: Document): Promise<RenderOutput> {
  const buffer = await Packer.toBuffer(doc);
  return {
    buffer: Buffer.from(buffer),
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
  };
}

// ── Mock Findings DOCX ──────────────────────────────────────────────

export async function renderFindingsDocx(pdfExport: PdfExport): Promise<RenderOutput> {
  const meta: MetaInfo = {
    topicCatalogVersion: pdfExport.metadata.topicCatalogVersion,
    topicCatalogHash: pdfExport.metadata.topicCatalogSha256,
    prsLogicVersion: pdfExport.metadata.prsLogicProfilesVersion,
    prsLogicHash: pdfExport.metadata.prsLogicProfilesSha256,
  };

  const children: Paragraph[] = [
    heading('Mock Inspection Findings'),
    emptyParagraph(),
    boldText('Provider: ', pdfExport.metadata.providerName ?? pdfExport.metadata.providerId),
    ...(pdfExport.metadata.facilityName ? [boldText('Facility: ', pdfExport.metadata.facilityName)] : []),
    boldText('Session: ', displayId(pdfExport.metadata.sessionId)),
    boldText('Generated: ', formatDate(pdfExport.generatedAt)),
    boldText('Total Findings: ', String(pdfExport.totalFindings)),
    emptyParagraph(),
  ];

  for (const page of pdfExport.pages) {
    for (const finding of page.findings) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `[${finding.severity}] ${finding.title}`,
              bold: true,
              color: severityColor(finding.severity),
              size: 22,
            }),
          ],
          spacing: { before: 200, after: 60 },
        })
      );
      children.push(
        bodyText(`Risk Score: ${finding.compositeRiskScore} | Regulation: ${finding.regulationId} § ${finding.regulationSectionId}`, '555555')
      );
      children.push(bodyText(finding.description));

      // Evidence status
      if (finding.evidenceProvided.length > 0) {
        children.push(bulletItem(`Evidence Provided: ${finding.evidenceProvided.join(', ')}`, '2E7D32'));
      }
      if (finding.evidenceMissing.length > 0) {
        children.push(bulletItem(`Evidence Missing: ${finding.evidenceMissing.join(', ')}`, 'D32F2F'));
      }
      if (finding.evidenceRequired.length > 0) {
        children.push(bulletItem(`Evidence Required: ${finding.evidenceRequired.join(', ')}`, '555555'));
      }

      // Actions
      if (finding.actions.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `Actions (${finding.actions.length}):`, bold: true, size: 18, color: '1A237E' })],
            spacing: { before: 60, after: 40 },
          })
        );
        for (const action of finding.actions) {
          const parts = [
            action.description,
            action.ownerRole ? `Owner: ${action.ownerRole}` : null,
            action.targetCompletionDate ? `Due: ${formatDate(action.targetCompletionDate)}` : null,
            `Status: ${action.status}`,
          ].filter(Boolean).join(' | ');
          children.push(bulletItem(parts));
        }
      }
    }
  }

  const doc = new Document({
    sections: [{
      headers: { default: makeHeader(pdfExport.watermark) },
      footers: { default: makeFooter(meta) },
      children,
    }],
  });

  return packDoc(doc);
}

// ── Inspector Evidence Pack DOCX ────────────────────────────────────

export async function renderInspectorPackDocx(pack: InspectorEvidencePack): Promise<RenderOutput> {
  const meta: MetaInfo = {
    topicCatalogVersion: pack.metadata.topicCatalogVersion,
    topicCatalogHash: pack.metadata.topicCatalogHash,
    prsLogicVersion: pack.metadata.prsLogicProfilesVersion,
    prsLogicHash: pack.metadata.prsLogicProfilesHash,
  };

  const children: Paragraph[] = [
    heading('Inspector Evidence Pack'),
    emptyParagraph(),
    boldText('Facility: ', pack.facilityName),
    boldText('Generated: ', formatDate(pack.generatedAt)),
    boldText('Overall Coverage: ', `${pack.overallCoverage.covered}/${pack.overallCoverage.total} (${pack.overallCoverage.percentage}%)`),
    emptyParagraph(),
    heading('Coverage Summary', HeadingLevel.HEADING_2),
  ];

  // Coverage table
  const tableRows = [
    simpleTableRow(['Key Question', 'Covered', 'Percentage'], true),
    ...pack.keyQuestionSections.map((s) =>
      simpleTableRow([s.label, `${s.coverageSummary.covered}/${s.coverageSummary.total}`, `${s.coverageSummary.percentage}%`])
    ),
  ];
  children.push(
    new Paragraph({ children: [] }), // spacer before table
  );

  const sectionChildren: (Paragraph | Table)[] = [...children];

  sectionChildren.push(
    new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    })
  );
  sectionChildren.push(emptyParagraph());

  // Per-QS detail
  for (const section of pack.keyQuestionSections) {
    sectionChildren.push(heading(section.label, HeadingLevel.HEADING_2));
    sectionChildren.push(
      bodyText(`Coverage: ${section.coverageSummary.covered}/${section.coverageSummary.total} (${section.coverageSummary.percentage}%)`, '555555')
    );

    for (const qs of section.qualityStatements) {
      const statusLabel = qs.covered ? 'Covered' : (qs.awaitingAuditItems.length > 0 ? 'Partial' : 'Gap');
      const color = qs.covered ? '2E7D32' : (qs.awaitingAuditItems.length > 0 ? 'F9A825' : 'D32F2F');

      sectionChildren.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${qs.id}: ${qs.title} — ${statusLabel}`, bold: true, color, size: 20 }),
          ],
          spacing: { before: 120, after: 60 },
        })
      );

      for (const item of qs.evidenceItems) {
        sectionChildren.push(bulletItem(`${item.fileName} (${item.evidenceType}) — ${item.mappingSource}`));
      }
      for (const gap of qs.gaps) {
        sectionChildren.push(bulletItem(gap, 'D32F2F'));
      }
    }
  }

  // Outstanding Readiness
  sectionChildren.push(heading('Outstanding Readiness Indicators', HeadingLevel.HEADING_2));
  sectionChildren.push(
    bodyText(`Overall indicator coverage: ${pack.outstandingReadiness.overallScore}%`)
  );

  for (const indicator of pack.outstandingReadiness.indicators) {
    const badge = indicator.hasEvidence ? 'Present' : 'Missing';
    const color = indicator.hasEvidence ? '2E7D32' : '999999';
    sectionChildren.push(
      new Paragraph({
        children: [new TextRun({ text: `${indicator.label} — ${badge}`, bold: true, color, size: 20 })],
        spacing: { before: 100, after: 40 },
      })
    );
    sectionChildren.push(bodyText(indicator.description, '555555'));
    for (const item of indicator.evidenceItems) {
      sectionChildren.push(bulletItem(`${item.fileName} (${item.signalType})`));
    }
  }

  const doc = new Document({
    sections: [{
      headers: { default: makeHeader(pack.watermark) },
      footers: { default: makeFooter(meta) },
      children: sectionChildren,
    }],
  });

  return packDoc(doc);
}

// ── Blue Ocean Board DOCX ───────────────────────────────────────────

export async function renderBlueOceanBoardDocx(report: BlueOceanReport): Promise<RenderOutput> {
  const meta: MetaInfo = {
    topicCatalogVersion: report.metadata.topicCatalogVersion,
    topicCatalogHash: report.metadata.topicCatalogHash,
    prsLogicVersion: report.metadata.prsLogicProfilesVersion,
    prsLogicHash: report.metadata.prsLogicProfilesHash,
  };

  const sectionChildren: (Paragraph | Table)[] = [];

  // Cover
  sectionChildren.push(heading('Blue Ocean Report — Board Pack'));
  sectionChildren.push(emptyParagraph());
  sectionChildren.push(boldText('Domain: ', String(report.domain)));
  sectionChildren.push(boldText('Reporting Domain: ', String(report.reportingDomain)));
  sectionChildren.push(emptyParagraph());

  // Quality Gates
  sectionChildren.push(heading('Quality Assurance Gates', HeadingLevel.HEADING_2));
  const qg = report.sections.qualityGates;
  sectionChildren.push(new Table({
    rows: [
      simpleTableRow(['Gate', 'Score'], true),
      simpleTableRow(['RCA Coverage', `${qg.rcaCoverageScore}%`]),
      simpleTableRow(['Mock Watermark', `${qg.mockWatermarkScore}%`]),
      simpleTableRow(['Domain Consistency', `${qg.domainConsistencyScore}%`]),
      simpleTableRow(['Determinism', `${qg.determinismScore}%`]),
      simpleTableRow(['Overall', `${qg.overallScore}%`]),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
  }));
  sectionChildren.push(emptyParagraph());

  // Executive Summary
  sectionChildren.push(heading('Executive Summary', HeadingLevel.HEADING_2));
  const es = report.sections.executiveSummary;
  sectionChildren.push(boldText('Total Findings: ', String(es.totalFindings)));
  sectionChildren.push(boldText('Major Findings: ', String(es.majorFindings)));
  sectionChildren.push(boldText('Top Severity: ', String(es.topSeverity ?? 'None')));
  sectionChildren.push(boldText('Open Actions: ', String(es.openActions)));
  sectionChildren.push(boldText('Verified Actions: ', String(es.verifiedActions)));
  sectionChildren.push(emptyParagraph());

  // Priority Findings
  if (report.sections.majorFindings.length > 0) {
    sectionChildren.push(heading('Priority Findings', HeadingLevel.HEADING_2));
    for (const finding of report.sections.majorFindings) {
      sectionChildren.push(
        new Paragraph({
          children: [
            new TextRun({ text: `[${finding.severity}] ${finding.title}`, bold: true, color: severityColor(finding.severity), size: 22 }),
          ],
          spacing: { before: 120, after: 40 },
        })
      );
      sectionChildren.push(bodyText(`Risk: ${finding.compositeRiskScore} | Regulation: ${finding.regulationId}`, '555555'));
    }
    sectionChildren.push(emptyParagraph());
  }

  // Action Plan
  if (report.sections.remediationPlan.actionDetails.length > 0) {
    sectionChildren.push(heading('Action Plan', HeadingLevel.HEADING_2));
    const rp = report.sections.remediationPlan;
    sectionChildren.push(
      bodyText(`Open: ${rp.openActions} | In Progress: ${rp.inProgressActions} | Pending Verification: ${rp.pendingVerificationActions} | Verified: ${rp.verifiedActions}`)
    );

    const actionRows = [
      simpleTableRow(['Description', 'Owner', 'Deadline', 'Status'], true),
      ...rp.actionDetails.map((a) =>
        simpleTableRow([
          a.description,
          a.ownerRole ?? '—',
          a.targetCompletionDate ? formatDate(a.targetCompletionDate) : '—',
          a.status,
        ])
      ),
    ];
    sectionChildren.push(new Table({
      rows: actionRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    }));
    sectionChildren.push(emptyParagraph());
  }

  // Risk Outlook
  sectionChildren.push(heading('Risk Outlook', HeadingLevel.HEADING_2));
  const ro = report.sections.riskOutlook;
  sectionChildren.push(boldText('Highest Risk: ', String(ro.highestCompositeRiskScore)));
  sectionChildren.push(boldText('Average Risk: ', String(ro.averageCompositeRiskScore)));
  sectionChildren.push(boldText('Risk Tiers: ', `High: ${ro.riskTierBreakdown.high}, Medium: ${ro.riskTierBreakdown.medium}, Low: ${ro.riskTierBreakdown.low}`));

  const doc = new Document({
    sections: [{
      headers: { default: makeHeader(report.watermark) },
      footers: { default: makeFooter(meta) },
      children: sectionChildren,
    }],
  });

  return packDoc(doc);
}

// ── Blue Ocean Audit DOCX ───────────────────────────────────────────

export async function renderBlueOceanAuditDocx(report: BlueOceanReport): Promise<RenderOutput> {
  const meta: MetaInfo = {
    topicCatalogVersion: report.metadata.topicCatalogVersion,
    topicCatalogHash: report.metadata.topicCatalogHash,
    prsLogicVersion: report.metadata.prsLogicProfilesVersion,
    prsLogicHash: report.metadata.prsLogicProfilesHash,
  };

  const sectionChildren: (Paragraph | Table)[] = [];

  // Cover
  sectionChildren.push(heading('Blue Ocean Report — Audit Pack'));
  sectionChildren.push(emptyParagraph());
  sectionChildren.push(boldText('Report ID: ', displayId(report.reportId)));
  sectionChildren.push(boldText('Domain: ', String(report.domain)));
  sectionChildren.push(boldText('Reporting Domain: ', String(report.reportingDomain)));
  sectionChildren.push(emptyParagraph());

  // Constitutional Metadata
  sectionChildren.push(heading('Constitutional Metadata', HeadingLevel.HEADING_2));
  sectionChildren.push(boldText('Topic Catalog: ', `${meta.topicCatalogVersion} (${meta.topicCatalogHash})`));
  sectionChildren.push(boldText('PRS Logic: ', `${meta.prsLogicVersion} (${meta.prsLogicHash})`));
  if (report.metadata.snapshotTimestamp) {
    sectionChildren.push(boldText('Snapshot: ', formatDate(report.metadata.snapshotTimestamp)));
  }
  sectionChildren.push(emptyParagraph());

  // Findings Overview
  sectionChildren.push(heading('Findings Overview', HeadingLevel.HEADING_2));
  const fo = report.sections.findingsOverview;
  sectionChildren.push(boldText('Total Findings: ', String(fo.totalFindings)));
  const sevEntries = Object.entries(fo.bySeverity) as [string, number][];
  for (const [sev, count] of sevEntries) {
    sectionChildren.push(bodyText(`${sev}: ${count}`, severityColor(sev)));
  }
  sectionChildren.push(emptyParagraph());

  // Evidence Index
  if (report.sections.evidenceIndex.length > 0) {
    sectionChildren.push(heading('Evidence Index', HeadingLevel.HEADING_2));
    const eiRows = [
      simpleTableRow(['Ref', 'Title', 'Type', 'Collected'], true),
      ...report.sections.evidenceIndex.map((e) =>
        simpleTableRow([e.evidenceRef, e.title, e.evidenceType, formatDate(e.collectedAt)])
      ),
    ];
    sectionChildren.push(new Table({
      rows: eiRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    }));
    sectionChildren.push(emptyParagraph());
  }

  // Root Cause Analysis
  if (report.sections.rootCauseAnalysis.length > 0) {
    sectionChildren.push(heading('Root Cause Analysis', HeadingLevel.HEADING_2));
    for (const rca of report.sections.rootCauseAnalysis) {
      sectionChildren.push(
        new Paragraph({
          children: [new TextRun({ text: `Finding: ${rca.findingId}`, bold: true, size: 20 })],
          spacing: { before: 120, after: 60 },
        })
      );
      for (const h of rca.hypotheses) {
        sectionChildren.push(bulletItem(`${h.hypothesis} (confidence: ${h.confidence})`));
        if (h.disconfirmingTests.length > 0) {
          sectionChildren.push(bulletItem(`  Disconfirming: ${h.disconfirmingTests.join(', ')}`, '555555'));
        }
      }
    }
    sectionChildren.push(emptyParagraph());
  }

  // Remediation Plan
  sectionChildren.push(heading('Remediation Plan', HeadingLevel.HEADING_2));
  const rp = report.sections.remediationPlan;
  sectionChildren.push(
    bodyText(`Open: ${rp.openActions} | In Progress: ${rp.inProgressActions} | Verified: ${rp.verifiedActions} | Rejected: ${rp.rejectedActions}`)
  );
  if (rp.actionDetails.length > 0) {
    const actionRows = [
      simpleTableRow(['Description', 'Finding', 'Owner', 'Deadline', 'Status'], true),
      ...rp.actionDetails.map((a) =>
        simpleTableRow([
          a.description,
          a.findingId,
          a.ownerRole ?? '—',
          a.targetCompletionDate ? formatDate(a.targetCompletionDate) : '—',
          a.status,
        ])
      ),
    ];
    sectionChildren.push(new Table({
      rows: actionRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    }));
  }
  sectionChildren.push(emptyParagraph());

  // Risk Outlook
  sectionChildren.push(heading('Risk Outlook', HeadingLevel.HEADING_2));
  const ro = report.sections.riskOutlook;
  sectionChildren.push(boldText('Highest Risk: ', String(ro.highestCompositeRiskScore)));
  sectionChildren.push(boldText('Average Risk: ', String(ro.averageCompositeRiskScore)));
  sectionChildren.push(emptyParagraph());

  // Regulatory Mapping
  sectionChildren.push(heading('Regulatory Mapping', HeadingLevel.HEADING_2));
  const rm = report.sections.regulatoryMapping;
  sectionChildren.push(boldText('Regulations Covered: ', String(rm.regulationsCovered)));
  if (rm.regulationIds.length > 0) {
    sectionChildren.push(bodyText(rm.regulationIds.join(', '), '555555'));
  }
  sectionChildren.push(emptyParagraph());

  // Data Lineage
  sectionChildren.push(heading('Data Lineage', HeadingLevel.HEADING_2));
  const dl = report.sections.dataLineage;
  sectionChildren.push(boldText('Findings: ', String(dl.findingIds.length)));
  sectionChildren.push(boldText('Actions: ', String(dl.actionIds.length)));
  sectionChildren.push(boldText('Evidence: ', String(dl.evidenceIds.length)));

  const doc = new Document({
    sections: [{
      headers: { default: makeHeader(report.watermark) },
      footers: { default: makeFooter(meta) },
      children: sectionChildren,
    }],
  });

  return packDoc(doc);
}
