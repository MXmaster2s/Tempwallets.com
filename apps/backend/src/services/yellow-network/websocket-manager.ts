/**
 * WebSocket Manager for Yellow Network Clearnode RPC
 *
 * Handles WebSocket connection lifecycle, message routing, and reconnection logic.
 * Implements exponential backoff for reconnection attempts.
 *
 * Key Features:
 * - Automatic reconnection with exponential backoff
 * - Request/response correlation via request IDs
 * - Message queueing when disconnected
 * - Promise-based request/response handling
 * - Detailed logging for debugging production issues
 *
 * Protocol Reference:
 * - Message Format: /Users/monstu/Developer/crawl4Ai/yellow/docs_protocol_off-chain_message-format.md
 */

import WebSocket from 'ws';
import { Logger } from '@nestjs/common';
import type {
  RPCRequest,
  RPCResponse,
  WebSocketConfig,
  AssetInfo,
} from './types.js';
import { ConnectionState } from './types.js';

/**
 * Response Handler Callback Type
 */
type ResponseHandler = (response: RPCResponse) => void;

/**
 * WebSocket Event Handlers
 */
interface WSEventHandlers {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (data: any) => void;
}

/**
 * WebSocket Manager Class
 *
 * Manages WebSocket connection to Yellow Network Clearnode
 * with automatic reconnection and message queueing.
 */
export class WebSocketManager {
  private readonly logger = new Logger('YellowNetworkWS');
  private ws: WebSocket | null = null;
  private url: string;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;

  // Configuration
  private reconnectAttempts: number;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private requestTimeout: number;

  // Message queue for offline requests
  private messageQueue: RPCRequest[] = [];

  // Request/response correlation
  private responseHandlers: Map<number, ResponseHandler> = new Map();
  private requestIdCounter = 1;

  // Cached server-pushed assets catalog
  private assetsCache: AssetInfo[] = [];

  // Reconnection timer
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Event handlers
  private eventHandlers: WSEventHandlers = {};

  constructor(config: WebSocketConfig) {
    this.url = config.url;
    this.maxReconnectAttempts = config.reconnectAttempts ?? 5;
    this.reconnectDelay = config.reconnectDelay ?? 1000;
    this.maxReconnectDelay = config.maxReconnectDelay ?? 30000;
    this.requestTimeout = config.requestTimeout ?? 30000;
    this.reconnectAttempts = 0;
  }

  /**
   * Connect to Clearnode WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connectionState === ConnectionState.CONNECTED) {
        this.logger.debug('Already connected, skipping connect');
        resolve();
        return;
      }

      this.connectionState = ConnectionState.CONNECTING;
      this.logger.log(`Connecting to Yellow Network: ${this.maskUrl(this.url)} (timeout: ${this.requestTimeout}ms)`);
      const connectStartTime = Date.now();

      try {
        this.ws = new WebSocket(this.url);
      } catch (error) {
        this.connectionState = ConnectionState.FAILED;
        this.logger.error(`Failed to create WebSocket: ${error instanceof Error ? error.message : 'Unknown error'}`);
        reject(error);
        return;
      }

      this.ws.on('open', () => {
        const connectDuration = Date.now() - connectStartTime;
        this.logger.log(`Connected to Yellow Network in ${connectDuration}ms`);
        this.connectionState = ConnectionState.CONNECTED;
        this.reconnectAttempts = 0; // Reset counter on successful connection

        // Flush any queued messages
        this.flushMessageQueue();

        // Notify listeners
        this.eventHandlers.onConnect?.();

        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const response: RPCResponse = JSON.parse(data.toString());
          this.handleMessage(response);
        } catch (error) {
          this.logger.error(`Failed to parse message: ${error instanceof Error ? error.message : 'Unknown'}`);
          this.eventHandlers.onError?.(error as Error);
        }
      });

      this.ws.on('error', (error: Error) => {
        const connectDuration = Date.now() - connectStartTime;
        this.logger.error(`WebSocket error after ${connectDuration}ms: ${error.message}`);
        this.eventHandlers.onError?.(error);

        if (this.connectionState === ConnectionState.CONNECTING) {
          reject(error);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        const reasonStr = reason.toString();
        if (code !== 1000) {
          this.logger.error(
            `Unexpected disconnect (code: ${code}, reason: ${reasonStr || 'none'})`,
          );
        } else {
          this.logger.log(`Connection closed normally (code: ${code})`);
        }

        this.connectionState = ConnectionState.DISCONNECTED;
        this.ws = null;

        // Notify listeners
        this.eventHandlers.onDisconnect?.();

        // Attempt reconnection if not intentionally closed
        if (
          code !== 1000 &&
          this.reconnectAttempts < this.maxReconnectAttempts
        ) {
          this.scheduleReconnect();
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.logger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
          this.connectionState = ConnectionState.FAILED;
        }
      });

      // Connection timeout
      const timeout = setTimeout(() => {
        if (this.connectionState === ConnectionState.CONNECTING) {
          const connectDuration = Date.now() - connectStartTime;
          this.logger.error(`Connection timeout after ${connectDuration}ms to ${this.maskUrl(this.url)}`);
          this.ws?.terminate();
          reject(new Error(`Connection timeout after ${this.requestTimeout}ms`));
        }
      }, this.requestTimeout);

      this.ws.once('open', () => clearTimeout(timeout));
    });
  }

  /**
   * Disconnect from Clearnode WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      // Disconnect logs moved to debug level
      this.ws.close(1000, 'Client disconnect'); // Normal closure
      this.ws = null;
    }

    this.connectionState = ConnectionState.DISCONNECTED;
  }

  /**
   * Send RPC request and wait for response
   */
  async send(request: RPCRequest): Promise<RPCResponse> {
    return new Promise((resolve, reject) => {
      const requestId = request.req[0];
      const method = request.req[1];
      const sendStartTime = Date.now();

      this.logger.debug(`--> RPC [${requestId}] ${method} (timeout: ${this.requestTimeout}ms)`);

      // Set up response handler
      this.responseHandlers.set(requestId, (response: RPCResponse) => {
        const duration = Date.now() - sendStartTime;
        if (response.error) {
          this.logger.error(`<-- RPC [${requestId}] ${method} ERROR in ${duration}ms: ${response.error.message || 'Unknown RPC error'}`);
          reject(new Error(response.error.message || 'RPC error'));
        } else {
          this.logger.debug(`<-- RPC [${requestId}] ${method} OK in ${duration}ms`);
          resolve(response);
        }
      });

      // Set timeout for request
      const timeout = setTimeout(() => {
        const duration = Date.now() - sendStartTime;
        this.responseHandlers.delete(requestId);
        this.logger.error(`<-- RPC [${requestId}] ${method} TIMEOUT after ${duration}ms`);
        reject(
          new Error(
            `Request ${requestId} (${method}) timed out after ${this.requestTimeout}ms`,
          ),
        );
      }, this.requestTimeout);

      // Clear timeout when response arrives
      const originalHandler = this.responseHandlers.get(requestId)!;
      this.responseHandlers.set(requestId, (response) => {
        clearTimeout(timeout);
        originalHandler(response);
      });

      // Send message if connected, otherwise queue
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify(request));
        } catch (error) {
          this.responseHandlers.delete(requestId);
          clearTimeout(timeout);
          this.logger.error(`Failed to send RPC [${requestId}] ${method}: ${error instanceof Error ? error.message : 'Unknown'}`);
          reject(error);
        }
      } else {
        this.logger.warn(`WebSocket not connected, queueing RPC [${requestId}] ${method}`);
        this.messageQueue.push(request);
      }
    });
  }

  /**
   * Get next available request ID
   */
  getNextRequestId(): number {
    return this.requestIdCounter++;
  }

  /**
   * Register event handlers
   */
  on(
    event: 'connect' | 'disconnect' | 'error' | 'message',
    handler: (...args: any[]) => void,
  ): void {
    switch (event) {
      case 'connect':
        this.eventHandlers.onConnect = handler;
        break;
      case 'disconnect':
        this.eventHandlers.onDisconnect = handler;
        break;
      case 'error':
        this.eventHandlers.onError = handler;
        break;
      case 'message':
        this.eventHandlers.onMessage = handler;
        break;
    }
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Get cached asset catalog (last received via notification)
   */
  getAssetsCache(): AssetInfo[] {
    return this.assetsCache;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return (
      this.connectionState === ConnectionState.CONNECTED &&
      this.ws?.readyState === WebSocket.OPEN
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(response: RPCResponse): void {
    const requestId = response.res[0];
    const method = response.res[1];

    // Notify general message handler
    this.eventHandlers.onMessage?.(response);

    // Handle correlated request/response
    const handler = this.responseHandlers.get(requestId);
    if (handler) {
      handler(response);
      this.responseHandlers.delete(requestId);
    } else {
      // Unsolicited message (notification) - logs moved to debug level
      this.handleNotification(response);
    }
  }

  /**
   * Handle server-initiated notifications
   * Examples: bu (balance update), cu (channel update), tr (transfer), asu (app session update)
   */
  private handleNotification(response: RPCResponse): void {
    const method = response.res[1];
    const data = response.res[2];

    switch (method) {
      case 'bu': // Balance Update
        this.logger.debug(`Notification: balance update`);
        break;
      case 'cu': // Channel Update
        this.logger.debug(`Notification: channel update`);
        break;
      case 'tr': // Transfer
        this.logger.debug(`Notification: transfer`);
        break;
      case 'asu': // App Session Update
        this.logger.debug(`Notification: app session update`);
        break;
      case 'assets':
        // Cache assets catalog
        if (Array.isArray(data?.assets)) {
          this.assetsCache = data.assets as AssetInfo[];
          this.logger.debug(`Notification: received ${this.assetsCache.length} assets`);
        }
        break;
      default:
        // Log unknown notification types as warnings
        this.logger.warn(`Unknown notification type: ${method}`);
    }
  }

  /**
   * Flush queued messages after reconnection
   */
  private flushMessageQueue(): void {
    if (!this.isConnected() || this.messageQueue.length === 0) {
      return;
    }

    this.logger.debug(`Flushing ${this.messageQueue.length} queued messages`);

    while (this.messageQueue.length > 0 && this.isConnected()) {
      const request = this.messageQueue.shift();
      if (request && this.ws) {
        try {
          this.ws.send(JSON.stringify(request));
        } catch (error) {
          this.logger.error(`Failed to send queued message: ${error instanceof Error ? error.message : 'Unknown'}`);
          // Re-queue if failed
          this.messageQueue.unshift(request);
          break;
        }
      }
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay,
    );

    this.logger.warn(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    this.connectionState = ConnectionState.RECONNECTING;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      try {
        await this.connect();
      } catch (error) {
        this.logger.error(`Reconnection attempt ${this.reconnectAttempts} failed: ${error instanceof Error ? error.message : 'Unknown'}`);
        // Will automatically schedule another attempt via close handler
      }
    }, delay);
  }

  /**
   * Mask URL for safe logging (hide tokens/keys)
   */
  private maskUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Return host and path without query params
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return url.length > 50 ? url.substring(0, 50) + '...' : url;
    }
  }
}
