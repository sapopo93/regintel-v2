/**
 * Shared types for PDF and DOCX renderers.
 */

export interface RenderOutput {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}
