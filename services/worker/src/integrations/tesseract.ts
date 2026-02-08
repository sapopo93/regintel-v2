/**
 * Tesseract OCR Integration
 *
 * Text extraction from images and PDFs using Tesseract.
 * Note: Requires tesseract-ocr to be installed on the system.
 */

import { exec } from 'node:child_process';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { config } from '../config';

/**
 * OCR result
 */
export interface OCRResult {
  /** Whether OCR completed successfully */
  success: boolean;

  /** Extracted text */
  text?: string;

  /** Average confidence (0-100) */
  confidence?: number;

  /** Error message if failed */
  error?: string;

  /** Processing time in ms */
  processingTimeMs: number;
}

/**
 * Execute shell command with timeout
 */
function execAsync(
  command: string,
  timeout: number = 60000
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Check if Tesseract is installed
 */
export async function isTesseractInstalled(): Promise<boolean> {
  if (!config.tesseract.enabled) {
    return false;
  }

  try {
    await execAsync('tesseract --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract text from image using Tesseract
 */
export async function extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
  const startTime = Date.now();

  if (!config.tesseract.enabled) {
    return {
      success: false,
      error: 'Tesseract is disabled',
      processingTimeMs: Date.now() - startTime,
    };
  }

  // Create temporary files
  const tempId = randomBytes(8).toString('hex');
  const inputPath = join(tmpdir(), `ocr-input-${tempId}`);
  const outputPath = join(tmpdir(), `ocr-output-${tempId}`);

  try {
    // Write input image
    await writeFile(inputPath, imageBuffer);

    // Run Tesseract
    const lang = config.tesseract.lang;
    const command = `tesseract "${inputPath}" "${outputPath}" -l ${lang} --psm 3`;

    await execAsync(command, 120000); // 2 minute timeout

    // Read output
    const text = await readFile(`${outputPath}.txt`, 'utf-8');

    return {
      success: true,
      text: text.trim(),
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: Date.now() - startTime,
    };
  } finally {
    // Cleanup temporary files
    try {
      await unlink(inputPath);
      await unlink(`${outputPath}.txt`);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extract text from PDF (first converts to images, then OCR)
 * Note: Requires pdftoppm (poppler-utils) for PDF to image conversion
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<OCRResult> {
  const startTime = Date.now();

  if (!config.tesseract.enabled) {
    return {
      success: false,
      error: 'Tesseract is disabled',
      processingTimeMs: Date.now() - startTime,
    };
  }

  const tempId = randomBytes(8).toString('hex');
  const inputPath = join(tmpdir(), `pdf-input-${tempId}.pdf`);
  const outputPrefix = join(tmpdir(), `pdf-pages-${tempId}`);

  try {
    // Write input PDF
    await writeFile(inputPath, pdfBuffer);

    // Convert PDF to images using pdftoppm
    await execAsync(`pdftoppm -png "${inputPath}" "${outputPrefix}"`, 120000);

    // OCR each page
    const pages: string[] = [];
    let pageNum = 1;
    let hasMore = true;

    while (hasMore && pageNum <= 100) {
      // Limit to 100 pages
      const pagePath = `${outputPrefix}-${String(pageNum).padStart(2, '0')}.png`;

      try {
        const pageBuffer = await readFile(pagePath);
        const pageResult = await extractTextFromImage(pageBuffer);

        if (pageResult.success && pageResult.text) {
          pages.push(pageResult.text);
        }

        // Cleanup page image
        await unlink(pagePath);
        pageNum++;
      } catch {
        hasMore = false;
      }
    }

    if (pages.length === 0) {
      return {
        success: false,
        error: 'No text extracted from PDF',
        processingTimeMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      text: pages.join('\n\n--- Page Break ---\n\n'),
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: Date.now() - startTime,
    };
  } finally {
    // Cleanup input file
    try {
      await unlink(inputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extract text based on MIME type
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<OCRResult> {
  // Check if Tesseract is available
  if (!(await isTesseractInstalled())) {
    return {
      success: false,
      error: 'Tesseract not installed or disabled',
      processingTimeMs: 0,
    };
  }

  // Route based on MIME type
  if (mimeType === 'application/pdf') {
    return extractTextFromPDF(buffer);
  }

  if (mimeType.startsWith('image/')) {
    return extractTextFromImage(buffer);
  }

  // For other types, return error (text files should be read directly)
  return {
    success: false,
    error: `Unsupported MIME type for OCR: ${mimeType}`,
    processingTimeMs: 0,
  };
}
