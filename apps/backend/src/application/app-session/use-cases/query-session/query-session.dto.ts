/**
 * QUERY SESSION DTO
 *
 * Application Layer - Use Case Input/Output
 *
 * Query a specific app session by ID from Yellow Network.
 * Replaces the "search" endpoint from current implementation.
 */

export class QuerySessionDto {
  userId!: string;
  sessionId!: string;
  chain!: string;
}

export class QuerySessionResultDto {
  appSessionId!: string;
  status!: 'open' | 'closed';
  version!: number;
  definition!: {
    protocol: string;
    participants: string[];
    weights: number[];
    quorum: number;
    challenge: number;
    nonce: number;
  };
  allocations!: Array<{
    participant: string;
    asset: string;
    amount: string;
  }>;
  sessionData?: any;
}
