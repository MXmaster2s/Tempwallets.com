/**
 * APP SESSION ENTITY
 *
 * Domain Layer - Pure TypeScript, no framework dependencies
 *
 * Core business entity representing a Yellow Network app session (Lightning Node).
 * Encapsulates all business rules and invariants.
 *
 * Yellow Network app sessions are:
 * - Multi-party state channels for gasless transfers
 * - Defined by an immutable definition (participants, weights, quorum)
 * - Mutable allocations (balances) that update via signed state transitions
 * - Either 'open' (active) or 'closed' (finalized)
 *
 * Key Business Rules:
 * 1. Participants are defined at creation and cannot be changed
 * 2. Only participants can have allocations
 * 3. Sessions must be 'open' to update allocations
 * 4. Version increments with each state update
 */

import { SessionId } from '../value-objects/session-id.vo.js';
import { Allocation } from '../value-objects/allocation.vo.js';
import { SessionDefinition } from '../value-objects/session-definition.vo.js';

export type SessionStatus = 'open' | 'closed';

export class AppSession {
  private constructor(
    private readonly _id: SessionId,
    private readonly _definition: SessionDefinition,
    private _allocations: Allocation[],
    private _version: number,
    private _status: SessionStatus,
  ) {}

  /**
   * Factory method to create a new app session
   *
   * This represents the business logic for creating a session.
   * Yellow Network will assign the actual session ID.
   */
  static create(
    definition: SessionDefinition,
    initialAllocations: Allocation[],
  ): AppSession {
    // Business rule: Validate all allocations belong to participants
    for (const allocation of initialAllocations) {
      if (!definition.isParticipant(allocation.participant)) {
        throw new Error(
          `Cannot create session: allocation participant ${allocation.participant} is not in the participants list`,
        );
      }
    }

    // Generate placeholder ID (Yellow Network will provide real one)
    const sessionId = SessionId.generate(definition);

    return new AppSession(
      sessionId,
      definition,
      initialAllocations,
      1, // Initial version
      'open', // New sessions are always open
    );
  }

  /**
   * Reconstitute entity from Yellow Network data
   */
  static fromYellowNetwork(
    sessionId: string,
    definition: SessionDefinition,
    allocations: Allocation[],
    version: number,
    status: SessionStatus,
  ): AppSession {
    return new AppSession(
      SessionId.create(sessionId),
      definition,
      allocations,
      version,
      status,
    );
  }

  /**
   * Business logic: Update allocations
   *
   * This is how transfers, deposits, and withdrawals happen.
   * Yellow Network validates and signs these state transitions.
   */
  updateAllocations(newAllocations: Allocation[]): void {
    // Business rule: Cannot update closed sessions
    if (this._status !== 'open') {
      throw new Error('Cannot update closed session');
    }

    // Business rule: All allocations must be for valid participants
    for (const allocation of newAllocations) {
      if (!this._definition.isParticipant(allocation.participant)) {
        throw new Error(
          `Cannot update allocations: ${allocation.participant} is not a participant in this session`,
        );
      }
    }

    this._allocations = newAllocations;
    this._version++;
  }

  /**
   * Business logic: Close session
   *
   * Closing a session returns funds to unified balance and prevents further updates.
   */
  close(): void {
    // Business rule: Cannot close already closed session
    if (this._status === 'closed') {
      throw new Error('Session already closed');
    }

    this._status = 'closed';
  }

  /**
   * Business logic: Check if address is a participant
   */
  isParticipant(address: string): boolean {
    return this._definition.isParticipant(address);
  }

  /**
   * Get allocation for a specific participant and asset
   */
  getAllocation(participant: string, asset: string): Allocation | null {
    const normalized = participant.toLowerCase();
    const normalizedAsset = asset.toLowerCase();
    return (
      this._allocations.find(
        (a) =>
          a.participant.toLowerCase() === normalized &&
          a.asset.toLowerCase() === normalizedAsset,
      ) || null
    );
  }

  // ============================================================================
  // Getters (no setters - immutability and encapsulation)
  // ============================================================================

  get id(): SessionId {
    return this._id;
  }

  get definition(): SessionDefinition {
    return this._definition;
  }

  get allocations(): ReadonlyArray<Allocation> {
    return this._allocations;
  }

  get version(): number {
    return this._version;
  }

  get status(): SessionStatus {
    return this._status;
  }

  get participants(): ReadonlyArray<string> {
    return this._definition.participants;
  }
}
