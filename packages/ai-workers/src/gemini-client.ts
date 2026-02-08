/**
 * Gemini API Client
 *
 * Wrapper around Google's Generative AI SDK with:
 * - Rate limiting
 * - Retry logic
 * - Structured output parsing
 * - Error handling
 */

import { GoogleGenerativeAI, type GenerativeModel, type GenerationConfig } from '@google/generative-ai';

/**
 * Gemini client configuration
 */
export interface GeminiConfig {
  /** API key (from environment if not provided) */
  apiKey?: string;

  /** Model ID (default: gemini-2.0-flash) */
  modelId?: string;

  /** Maximum tokens in response */
  maxOutputTokens?: number;

  /** Temperature (0-1) */
  temperature?: number;

  /** Top-p sampling */
  topP?: number;

  /** Request timeout in ms */
  timeoutMs?: number;

  /** Number of retries */
  maxRetries?: number;

  /** Base delay between retries in ms */
  retryDelayMs?: number;
}

const DEFAULT_CONFIG: Required<GeminiConfig> = {
  apiKey: process.env.GEMINI_API_KEY || '',
  modelId: process.env.GEMINI_MODEL_ID || 'gemini-2.0-flash',
  maxOutputTokens: 4096,
  temperature: 0.3, // Lower for more consistent outputs
  topP: 0.8,
  timeoutMs: 30000,
  maxRetries: 3,
  retryDelayMs: 1000,
};

/**
 * Rate limiter to respect Gemini API limits
 */
class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private lastRefill: number;
  private refillRate: number; // tokens per ms

  constructor(requestsPerMinute: number = 60) {
    this.maxTokens = requestsPerMinute;
    this.tokens = requestsPerMinute;
    this.lastRefill = Date.now();
    this.refillRate = requestsPerMinute / 60000; // tokens per ms
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens < 1) {
      const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
      await this.sleep(waitTime);
      this.refill();
    }

    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Structured response from Gemini
 */
export interface GeminiResponse<T = unknown> {
  /** Parsed response data */
  data: T;

  /** Raw text response */
  rawText: string;

  /** Model's confidence (if extractable) */
  confidence?: number;

  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /** Response time in ms */
  latencyMs: number;
}

/**
 * Gemini API client
 */
export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private config: Required<GeminiConfig>;
  private rateLimiter: RateLimiter;

  constructor(config: GeminiConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (!this.config.apiKey) {
      throw new Error('Gemini API key is required. Set GEMINI_API_KEY environment variable.');
    }

    this.genAI = new GoogleGenerativeAI(this.config.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: this.config.modelId,
    });
    this.rateLimiter = new RateLimiter(60); // 60 RPM default
  }

  /**
   * Generate text response
   */
  async generateText(prompt: string): Promise<GeminiResponse<string>> {
    await this.rateLimiter.acquire();

    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: this.config.maxOutputTokens,
            temperature: this.config.temperature,
            topP: this.config.topP,
          },
        });

        const response = result.response;
        const text = response.text();
        const latencyMs = Date.now() - startTime;

        // Extract usage if available
        const usage = {
          promptTokens: response.usageMetadata?.promptTokenCount || 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: response.usageMetadata?.totalTokenCount || 0,
        };

        return {
          data: text,
          rawText: text,
          usage,
          latencyMs,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on certain errors
        if (this.isNonRetryableError(lastError)) {
          throw lastError;
        }

        // Wait before retry
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Failed to generate response');
  }

  /**
   * Generate structured JSON response
   */
  async generateJSON<T>(
    prompt: string,
    schema: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    }
  ): Promise<GeminiResponse<T>> {
    // Add JSON instructions to prompt
    const jsonPrompt = `${prompt}

IMPORTANT: Respond with a valid JSON object matching this schema:
${JSON.stringify(schema, null, 2)}

Your response must be ONLY valid JSON, no markdown code blocks, no explanations.`;

    const response = await this.generateText(jsonPrompt);

    // Parse JSON from response
    let parsed: T;
    try {
      // Try to extract JSON from potential markdown code blocks
      let jsonText = response.rawText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7);
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3);
      }
      if (jsonText.endsWith('```')) {
        jsonText = jsonText.slice(0, -3);
      }

      parsed = JSON.parse(jsonText.trim());
    } catch (parseError) {
      throw new Error(
        `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
      );
    }

    return {
      ...response,
      data: parsed,
    };
  }

  /**
   * Check if error is non-retryable
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('invalid api key') ||
      message.includes('api key not valid') ||
      message.includes('permission denied') ||
      message.includes('quota exceeded')
    );
  }

  /**
   * Get model info
   */
  getModelId(): string {
    return this.config.modelId;
  }
}

/**
 * Default Gemini client instance
 */
let defaultClient: GeminiClient | null = null;

/**
 * Get or create default Gemini client
 */
export function getGeminiClient(config?: GeminiConfig): GeminiClient {
  if (!defaultClient || config) {
    defaultClient = new GeminiClient(config);
  }
  return defaultClient;
}

/**
 * Check if Gemini is configured
 */
export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}
