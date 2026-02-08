/**
 * ClamAV Integration
 *
 * Scans files for malware using ClamAV daemon via socket.
 */

import { createConnection, type Socket } from 'node:net';
import { config } from '../config';

/**
 * ClamAV scan result
 */
export interface ClamAVScanResult {
  /** Whether scan completed successfully */
  success: boolean;

  /** Scan status */
  status: 'CLEAN' | 'INFECTED' | 'ERROR';

  /** Threat name if infected */
  threat?: string;

  /** Error message if scan failed */
  error?: string;

  /** Scan duration in ms */
  scanTimeMs: number;
}

/**
 * ClamAV client for malware scanning
 */
export class ClamAVClient {
  private socketPath: string;
  private timeout: number;

  constructor(socketPath?: string, timeout?: number) {
    this.socketPath = socketPath || config.clamav.socketPath;
    this.timeout = timeout || config.clamav.timeout;
  }

  /**
   * Check if ClamAV daemon is available
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.sendCommand('PING');
      return response.trim() === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get ClamAV version
   */
  async version(): Promise<string> {
    const response = await this.sendCommand('VERSION');
    return response.trim();
  }

  /**
   * Scan a buffer for malware
   */
  async scanBuffer(buffer: Buffer): Promise<ClamAVScanResult> {
    const startTime = Date.now();

    try {
      // Use INSTREAM command for streaming scan
      const socket = await this.connect();

      return new Promise((resolve, reject) => {
        let response = '';

        socket.on('data', (data) => {
          response += data.toString();
        });

        socket.on('end', () => {
          const scanTimeMs = Date.now() - startTime;
          const result = this.parseResponse(response, scanTimeMs);
          resolve(result);
        });

        socket.on('error', (err) => {
          reject(err);
        });

        // Send INSTREAM command
        socket.write('zINSTREAM\0');

        // Send content in chunks with length prefix
        const chunkSize = 2048;
        for (let i = 0; i < buffer.length; i += chunkSize) {
          const chunk = buffer.slice(i, i + chunkSize);
          const lengthBuffer = Buffer.alloc(4);
          lengthBuffer.writeUInt32BE(chunk.length, 0);
          socket.write(lengthBuffer);
          socket.write(chunk);
        }

        // Send terminating zero-length chunk
        const zeroLength = Buffer.alloc(4);
        zeroLength.writeUInt32BE(0, 0);
        socket.write(zeroLength);
      });
    } catch (error) {
      return {
        success: false,
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
        scanTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Scan a file by path
   */
  async scanFile(filePath: string): Promise<ClamAVScanResult> {
    const startTime = Date.now();

    try {
      const response = await this.sendCommand(`SCAN ${filePath}`);
      const scanTimeMs = Date.now() - startTime;
      return this.parseResponse(response, scanTimeMs);
    } catch (error) {
      return {
        success: false,
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
        scanTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Connect to ClamAV socket
   */
  private connect(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.socketPath);

      socket.setTimeout(this.timeout);

      socket.on('connect', () => {
        resolve(socket);
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });

      socket.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Send command and get response
   */
  private async sendCommand(command: string): Promise<string> {
    const socket = await this.connect();

    return new Promise((resolve, reject) => {
      let response = '';

      socket.on('data', (data) => {
        response += data.toString();
      });

      socket.on('end', () => {
        resolve(response);
      });

      socket.on('error', (err) => {
        reject(err);
      });

      socket.write(`z${command}\0`);
    });
  }

  /**
   * Parse ClamAV response
   */
  private parseResponse(response: string, scanTimeMs: number): ClamAVScanResult {
    const trimmed = response.trim();

    // Response format: "stream: OK" or "stream: <threat> FOUND"
    if (trimmed.endsWith('OK')) {
      return {
        success: true,
        status: 'CLEAN',
        scanTimeMs,
      };
    }

    if (trimmed.includes('FOUND')) {
      // Extract threat name: "stream: Eicar-Test-Signature FOUND"
      const match = trimmed.match(/:\s*(.+)\s+FOUND$/);
      const threat = match ? match[1].trim() : 'Unknown threat';

      return {
        success: true,
        status: 'INFECTED',
        threat,
        scanTimeMs,
      };
    }

    // Error response
    return {
      success: false,
      status: 'ERROR',
      error: trimmed || 'Unknown error',
      scanTimeMs,
    };
  }
}

/**
 * Default ClamAV client instance
 */
let defaultClient: ClamAVClient | null = null;

/**
 * Get or create default ClamAV client
 */
export function getClamAVClient(): ClamAVClient {
  if (!defaultClient) {
    defaultClient = new ClamAVClient();
  }
  return defaultClient;
}

/**
 * Check if ClamAV is enabled and available
 */
export async function isClamAVAvailable(): Promise<boolean> {
  if (!config.clamav.enabled) {
    return false;
  }

  try {
    const client = getClamAVClient();
    return await client.ping();
  } catch {
    return false;
  }
}

export interface ClamAVHealth {
  enabled: boolean;
  available: boolean;
  version?: string;
}

/**
 * Get detailed ClamAV health status
 */
export async function getClamAVHealth(): Promise<ClamAVHealth> {
  if (!config.clamav.enabled) {
    return { enabled: false, available: false };
  }

  try {
    const client = getClamAVClient();
    const available = await client.ping();
    const version = available ? await client.version() : undefined;
    return { enabled: true, available, version };
  } catch {
    return { enabled: true, available: false };
  }
}

/**
 * EICAR test string for malware scanner testing
 * This is a standard test pattern recognized by all AV software
 */
export const EICAR_TEST_STRING =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
