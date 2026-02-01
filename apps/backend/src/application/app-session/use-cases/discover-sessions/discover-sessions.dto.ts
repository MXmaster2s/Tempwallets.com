/**
 * DISCOVER SESSIONS DTO
 *
 * Application Layer - Use Case Input/Output
 *
 * Discover all app sessions where user is a participant.
 * Yellow Network's auto-discovery feature.
 */

export class DiscoverSessionsDto {
  userId!: string;
  chain!: string;
  status?: 'open' | 'closed';
}

export class DiscoverSessionsResultDto {
  sessions!: Array<{
    appSessionId: string;
    status: 'open' | 'closed';
    version: number;
    participants: string[];
    allocations: Array<{
      participant: string;
      asset: string;
      amount: string;
    }>;
  }>;
  count!: number;
}
