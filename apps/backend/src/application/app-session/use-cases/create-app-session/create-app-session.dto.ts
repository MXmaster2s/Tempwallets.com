/**
 * CREATE APP SESSION DTO
 *
 * Application Layer - Use Case Input/Output
 *
 * Simplified from current implementation:
 * - Removed unnecessary complexity
 * - Follows Yellow Network's actual data model
 * - Framework-agnostic (HTTP validation happens in presentation layer)
 */

export class CreateAppSessionDto {
  userId!: string;
  chain!: string;
  participants!: string[];
  weights?: number[];
  quorum?: number;
  token!: string;
  initialAllocations?: Array<{
    participant: string;
    amount: string;
  }>;
  sessionData?: any;
}

export class CreateAppSessionResultDto {
  appSessionId!: string;
  status!: 'open' | 'closed';
  version!: number;
  participants!: string[];
  allocations!: Array<{
    participant: string;
    asset: string;
    amount: string;
  }>;
}
