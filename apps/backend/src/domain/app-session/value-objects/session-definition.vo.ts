/**
 * SESSION DEFINITION VALUE OBJECT
 *
 * Domain Layer - Pure TypeScript, no framework dependencies
 *
 * Represents the immutable definition of an app session.
 * Once created, the definition cannot be changed (Yellow Network protocol).
 *
 * Contains:
 * - protocol version
 * - participants (wallet addresses)
 * - weights (voting power distribution)
 * - quorum (minimum votes needed for decisions)
 * - challenge period (dispute window in seconds)
 * - nonce (unique identifier for this definition)
 */

export interface SessionDefinitionParams {
  protocol: string;
  participants: string[];
  weights: number[];
  quorum: number;
  challenge: number;
  nonce: number;
}

export class SessionDefinition {
  private constructor(
    public readonly protocol: string,
    public readonly participants: readonly string[],
    public readonly weights: readonly number[],
    public readonly quorum: number,
    public readonly challenge: number,
    public readonly nonce: number,
  ) {
    this.validate();
  }

  /**
   * Create session definition with validation
   */
  static create(params: SessionDefinitionParams): SessionDefinition {
    return new SessionDefinition(
      params.protocol,
      params.participants,
      params.weights,
      params.quorum,
      params.challenge,
      params.nonce,
    );
  }

  private validate(): void {
    // Validate protocol
    if (!this.protocol || this.protocol.trim().length === 0) {
      throw new Error('Protocol is required');
    }

    // Validate participants (must have at least one)
    if (!this.participants || this.participants.length === 0) {
      throw new Error('Session must have at least one participant');
    }

    // Validate all participants are valid addresses
    for (const participant of this.participants) {
      if (!participant || !participant.startsWith('0x')) {
        throw new Error(`Invalid participant address: ${participant}`);
      }
    }

    // Validate weights match participants
    if (this.weights.length !== this.participants.length) {
      throw new Error(
        `Weights array length (${this.weights.length}) must match participants length (${this.participants.length})`
      );
    }

    // Validate all weights are positive
    for (const weight of this.weights) {
      if (weight <= 0) {
        throw new Error(`All weights must be positive. Found: ${weight}`);
      }
    }

    // Validate quorum is between 1 and 100
    if (this.quorum < 1 || this.quorum > 100) {
      throw new Error(`Quorum must be between 1 and 100. Found: ${this.quorum}`);
    }

    // Validate challenge period is positive
    if (this.challenge <= 0) {
      throw new Error(`Challenge period must be positive. Found: ${this.challenge}`);
    }

    // Validate nonce is positive
    if (this.nonce <= 0) {
      throw new Error(`Nonce must be positive. Found: ${this.nonce}`);
    }
  }

  /**
   * Check if an address is a participant
   */
  isParticipant(address: string): boolean {
    const normalized = address.toLowerCase();
    return this.participants.some(p => p.toLowerCase() === normalized);
  }

  /**
   * Get weight for a participant
   */
  getParticipantWeight(address: string): number | null {
    const normalized = address.toLowerCase();
    const index = this.participants.findIndex(p => p.toLowerCase() === normalized);
    if (index < 0) return null;
    const weight = this.weights[index];
    return weight !== undefined ? weight : null;
  }

  /**
   * Convert to Yellow Network format
   */
  toYellowFormat(): {
    protocol: string;
    participants: string[];
    weights: number[];
    quorum: number;
    challenge: number;
    nonce: number;
  } {
    return {
      protocol: this.protocol,
      participants: [...this.participants],
      weights: [...this.weights],
      quorum: this.quorum,
      challenge: this.challenge,
      nonce: this.nonce,
    };
  }
}
