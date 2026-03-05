import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export function detectDocumentType(fileName: string, mimeType: string): string {
  void mimeType;
  const name = fileName.toLowerCase();

  if (name.includes('mar') || name.includes('medication') || name.includes('medic')) {
    return 'MAR_CHART';
  }

  if (
    name.includes('sign') ||
    name.includes('rota') ||
    name.includes('attendance') ||
    name.includes('timesheet')
  ) {
    return 'SIGN_IN_OUT';
  }

  if (name.includes('care plan') || name.includes('care-plan') || name.includes('careplan')) {
    return 'CARE_PLAN';
  }

  if (name.includes('incident') || name.includes('accident')) {
    return 'INCIDENT_LOG';
  }

  if (name.includes('training') || name.includes('matrix') || name.includes('competency')) {
    return 'TRAINING_MATRIX';
  }

  return 'OTHER';
}

export async function extractDocumentContent(filePath: string, mimeType: string): Promise<string> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString('base64');
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      return '';
    }

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: mimeType.startsWith('image/')
            ? [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mimeType, data: base64 },
                },
                {
                  type: 'text',
                  text: 'Extract ALL text from this document exactly as written. Preserve all dates, names, times, medication names, signatures (mark as [SIGNED] or [UNSIGNED]). Return plain text only.',
                },
              ]
            : [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: base64 },
                },
                {
                  type: 'text',
                  text: 'Extract ALL text from this document exactly as written.',
                },
              ],
        },
      ],
    });

    return response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  } catch (error) {
    console.error('[AUDITOR] extraction failed', error);
    return '';
  }
}
