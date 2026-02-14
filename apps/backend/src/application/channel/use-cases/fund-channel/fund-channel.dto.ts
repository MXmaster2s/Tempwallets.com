/**
 * FUND CHANNEL DTO
 *
 * Application Layer - Use Case Input/Output
 *
 * Creates or resizes a 2-party payment channel.
 * Moves funds from unified balance into the channel.
 *
 * Flow: Unified Balance → Payment Channel (2-party with clearnode)
 *
 * Note: This is different from app sessions (multi-party).
 * Channels are for efficient communication with Yellow Network clearnode.
 */

export class FundChannelDto {
  userId!: string;
  chain!: string;
  asset!: string; // e.g., "usdc", "usdt"
  amount!: string; // e.g., "100.0"
}

export class FundChannelResultDto {
  success!: boolean;
  channelId!: string;
  chainId!: number;
  amount!: string;
  message!: string;
}
