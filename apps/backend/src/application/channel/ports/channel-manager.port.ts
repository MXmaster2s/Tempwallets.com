/**
 * CHANNEL MANAGER PORT (INTERFACE)
 *
 * Application Layer - Defines contract for 2-party payment channel operations
 *
 * Channels are 2-party state channels between user and clearnode.
 * They allow moving funds from unified balance into a payment channel
 * for efficient communication with Yellow Network.
 *
 * Different from App Sessions (multi-party):
 * - Channels: 2-party (user ↔ clearnode)
 * - App Sessions: Multi-party (user ↔ user ↔ user)
 */

export interface CreateChannelParams {
  userAddress: string;
  chainId: number;
  tokenAddress: string;
  initialBalance: bigint;
}

export interface ResizeChannelParams {
  channelId: string;
  chainId: number;
  amount: bigint; // Positive = add funds, negative = remove funds
  userAddress: string;
  tokenAddress: string;
  participants: string[];
}

export interface ChannelInfo {
  channelId: string;
  chainId: number;
  balance: string;
  status: string;
}

export interface IChannelManagerPort {
  /**
   * Create a new 2-party payment channel
   */
  createChannel(params: CreateChannelParams): Promise<ChannelInfo>;

  /**
   * Resize channel (add or remove funds)
   * Moves funds from/to unified balance
   */
  resizeChannel(params: ResizeChannelParams): Promise<void>;

  /**
   * Get existing channels for user
   */
  getChannels(userAddress: string): Promise<ChannelInfo[]>;

  /**
   * Close a payment channel
   */
  closeChannel(
    channelId: string,
    chainId: number,
    fundsDestination: string,
  ): Promise<void>;
}

/**
 * Dependency injection token
 */
export const CHANNEL_MANAGER_PORT = Symbol('CHANNEL_MANAGER_PORT');
