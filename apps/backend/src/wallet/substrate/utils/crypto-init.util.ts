import { cryptoWaitReady } from '@polkadot/util-crypto';
import { Logger } from '@nestjs/common';

/**
 * WASM Initialization Utility
 *
 * CRITICAL: Lazy initialization pattern to avoid NestJS module initialization issues.
 * Each service that uses SR25519 must wait for ensureCryptoReady() before crypto operations.
 *
 * Issue #1: WASM Initialization Timing Problem
 * - DO NOT initialize in main.ts or module initialization
 * - Services initialize WASM on-demand when first crypto operation is needed
 */
class CryptoInitUtil {
  private static instance: CryptoInitUtil;
  private readyPromise: Promise<void> | null = null;
  private isReady = false;
  private readonly logger = new Logger(CryptoInitUtil.name);

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): CryptoInitUtil {
    if (!CryptoInitUtil.instance) {
      CryptoInitUtil.instance = new CryptoInitUtil();
    }
    return CryptoInitUtil.instance;
  }

  /**
   * Ensure WASM crypto is ready
   * Returns a promise that resolves when crypto is initialized
   * Safe to call multiple times - returns the same promise
   */
  async ensureCryptoReady(): Promise<void> {
    if (this.isReady) {
      return;
    }

    if (!this.readyPromise) {
      this.logger.log('Initializing WASM crypto (lazy loading)...');
      this.readyPromise = this.initialize();
    }

    return this.readyPromise;
  }

  /**
   * Initialize WASM crypto
   */
  private async initialize(): Promise<void> {
    try {
      const startTime = Date.now();
      await cryptoWaitReady();
      const duration = Date.now() - startTime;
      this.isReady = true;
      this.logger.log(`✓ WASM crypto initialized in ${duration}ms`);
    } catch (error) {
      this.logger.error(
        `Failed to initialize WASM crypto: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      this.readyPromise = null; // Allow retry
      throw error;
    }
  }

  /**
   * Check if crypto is ready (synchronous check)
   */
  checkReady(): boolean {
    return this.isReady;
  }

  /**
   * Reset ready state (for testing purposes)
   */
  reset(): void {
    this.isReady = false;
    this.readyPromise = null;
  }
}

// Export singleton instance
const cryptoInitUtil = CryptoInitUtil.getInstance();

/**
 * Ensure crypto is ready - main export function
 * Use this in all Substrate services before crypto operations
 */
export async function ensureCryptoReady(): Promise<void> {
  return cryptoInitUtil.ensureCryptoReady();
}

/**
 * Check if crypto is ready (synchronous)
 */
export function isCryptoReady(): boolean {
  return cryptoInitUtil.checkReady();
}
