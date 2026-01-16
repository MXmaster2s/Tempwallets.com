/**
 * HTTP Request Logger
 *
 * Wraps fetch calls with detailed logging for debugging production issues.
 * Logs request start, completion, timing, and any errors.
 */

import { Logger } from '@nestjs/common';

export interface HttpRequestLog {
  requestId: string;
  url: string;
  method: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status?: number;
  statusText?: string;
  error?: string;
  aborted?: boolean;
}

export interface LoggingFetchOptions extends RequestInit {
  timeoutMs?: number;
  serviceName?: string;
  retryAttempt?: number;
}

/**
 * Generate a short unique request ID for correlation
 */
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Wrap fetch with comprehensive logging for debugging production timeouts
 *
 * @param url - The URL to fetch
 * @param options - Fetch options with additional logging configuration
 * @returns The fetch response
 */
export async function loggingFetch(
  url: string,
  options: LoggingFetchOptions = {},
): Promise<Response> {
  const logger = new Logger(options.serviceName || 'HttpRequest');
  const requestId = generateRequestId();
  const method = options.method || 'GET';
  const timeoutMs = options.timeoutMs || 60000;
  const retryAttempt = options.retryAttempt || 1;

  const log: HttpRequestLog = {
    requestId,
    url,
    method,
    startTime: Date.now(),
  };

  // Log request start with details
  logger.log(
    `[${requestId}] --> ${method} ${maskUrl(url)} (attempt ${retryAttempt}, timeout ${timeoutMs}ms)`,
  );

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.warn(
      `[${requestId}] TIMEOUT after ${timeoutMs}ms - aborting request to ${maskUrl(url)}`,
    );
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    log.endTime = Date.now();
    log.durationMs = log.endTime - log.startTime;
    log.status = response.status;
    log.statusText = response.statusText;

    // Log response details
    const statusEmoji = response.ok ? '✓' : '✗';
    logger.log(
      `[${requestId}] <-- ${statusEmoji} ${response.status} ${response.statusText} in ${log.durationMs}ms`,
    );

    // Log slow requests as warnings
    if (log.durationMs > 10000) {
      logger.warn(
        `[${requestId}] SLOW REQUEST: ${log.durationMs}ms to ${maskUrl(url)}`,
      );
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    log.endTime = Date.now();
    log.durationMs = log.endTime - log.startTime;

    if (error instanceof Error) {
      log.error = error.message;
      log.aborted = error.name === 'AbortError';

      if (log.aborted) {
        logger.error(
          `[${requestId}] <-- ABORTED (timeout) after ${log.durationMs}ms - ${maskUrl(url)}`,
        );
      } else {
        logger.error(
          `[${requestId}] <-- ERROR after ${log.durationMs}ms: ${error.message}`,
        );
      }
    } else {
      log.error = 'Unknown error';
      logger.error(`[${requestId}] <-- UNKNOWN ERROR after ${log.durationMs}ms`);
    }

    throw error;
  }
}

/**
 * Mask sensitive parts of URLs for logging (hide API keys, tokens)
 */
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Mask common sensitive query parameters
    const sensitiveParams = ['key', 'api_key', 'apikey', 'token', 'secret'];
    sensitiveParams.forEach((param) => {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '***');
      }
    });
    // Return host + pathname (without query params for brevity in logs)
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    // If URL parsing fails, return original (truncated)
    return url.length > 80 ? url.substring(0, 80) + '...' : url;
  }
}

/**
 * Network connectivity diagnostic helper
 * Useful for debugging production network issues
 */
export async function diagnoseNetworkConnectivity(
  logger: Logger,
): Promise<{
  results: Array<{
    service: string;
    url: string;
    success: boolean;
    durationMs: number;
    error?: string;
    status?: number;
  }>;
  summary: string;
}> {
  const endpoints = [
    { service: 'DNS (Google)', url: 'https://dns.google/resolve?name=google.com' },
    { service: 'Zerion API', url: 'https://api.zerion.io/v1/' },
    { service: 'Ethereum RPC (Alchemy)', url: 'https://eth-mainnet.alchemyapi.io/' },
    { service: 'Yellow Network Clearnode', url: 'https://clearnode-api.yellow.network/' },
  ];

  const results = await Promise.all(
    endpoints.map(async ({ service, url }) => {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
        }).catch(() =>
          // Try GET if HEAD fails
          fetch(url, { signal: controller.signal }),
        );

        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;

        return {
          service,
          url,
          success: true,
          durationMs,
          status: response.status,
        };
      } catch (error) {
        const durationMs = Date.now() - startTime;
        return {
          service,
          url,
          success: false,
          durationMs,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),
  );

  const successCount = results.filter((r) => r.success).length;
  const summary = `Network diagnostic: ${successCount}/${results.length} endpoints reachable`;

  logger.log(summary);
  results.forEach((r) => {
    if (r.success) {
      logger.log(`  ✓ ${r.service}: ${r.durationMs}ms (status ${r.status})`);
    } else {
      logger.error(`  ✗ ${r.service}: ${r.error} (${r.durationMs}ms)`);
    }
  });

  return { results, summary };
}

/**
 * Log environment info useful for debugging
 */
export function logEnvironmentInfo(logger: Logger): void {
  logger.log('=== Environment Info ===');
  logger.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  logger.log(`Platform: ${process.platform}`);
  logger.log(`Node version: ${process.version}`);
  logger.log(`Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`);

  // Log presence of key environment variables (not their values)
  const keyVars = [
    'ZERION_API_KEY',
    'YELLOW_NETWORK_WS_URL',
    'ETH_RPC_URL',
    'BASE_RPC_URL',
    'DATABASE_URL',
  ];

  logger.log('Key environment variables:');
  keyVars.forEach((varName) => {
    const isSet = !!process.env[varName];
    const preview = isSet && process.env[varName]
      ? `${process.env[varName]!.substring(0, 10)}...`
      : 'NOT SET';
    logger.log(`  ${varName}: ${isSet ? `SET (${preview})` : 'NOT SET'}`);
  });
  logger.log('========================');
}
