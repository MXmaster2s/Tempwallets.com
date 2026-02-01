/**
 * UPDATE ALLOCATION DTO
 *
 * Application Layer - Use Case Input/Output
 *
 * Covers three operations in Yellow Network:
 * - DEPOSIT: Add funds from unified balance to app session
 * - OPERATE: Transfer funds between participants (gasless)
 * - WITHDRAW: Remove funds from app session to unified balance
 *
 * Simplified naming from current implementation:
 * - Old: deposit, transfer, withdraw (separate endpoints)
 * - New: updateAllocation with intent (single operation)
 */

export type AllocationIntent = 'DEPOSIT' | 'OPERATE' | 'WITHDRAW';

export class UpdateAllocationDto {
  userId!: string;
  appSessionId!: string;
  chain!: string;
  intent!: AllocationIntent;
  allocations!: Array<{
    participant: string;
    asset: string;
    amount: string;
  }>;
}

export class UpdateAllocationResultDto {
  appSessionId!: string;
  version!: number;
  allocations!: Array<{
    participant: string;
    asset: string;
    amount: string;
  }>;
}
