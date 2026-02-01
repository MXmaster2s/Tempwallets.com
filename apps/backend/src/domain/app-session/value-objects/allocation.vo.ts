/**
 * ALLOCATION VALUE OBJECT
 *
 * Domain Layer - Pure TypeScript, no framework dependencies
 *
 * Represents a participant's asset allocation within an app session.
 * Immutable value object with built-in validation.
 *
 * Yellow Network tracks allocations as part of app session state.
 */

export class Allocation {
  private constructor(
    public readonly participant: string,
    public readonly asset: string,
    public readonly amount: string,
  ) {
    this.validate();
  }

  /**
   * Create allocation with validation
   */
  static create(participant: string, asset: string, amount: string): Allocation {
    return new Allocation(participant, asset, amount);
  }

  private validate(): void {
    // Validate participant address (0x-prefixed hex)
    if (!this.participant || !this.participant.startsWith('0x')) {
      throw new Error(`Invalid participant address: ${this.participant}`);
    }

    // Validate asset is specified
    if (!this.asset || this.asset.trim().length === 0) {
      throw new Error('Asset is required');
    }

    // Validate amount is valid number
    const amountNum = parseFloat(this.amount);
    if (isNaN(amountNum) || amountNum < 0) {
      throw new Error(`Invalid amount: ${this.amount}. Must be a non-negative number.`);
    }
  }

  /**
   * Value objects are compared by value, not reference
   */
  equals(other: Allocation): boolean {
    return (
      this.participant.toLowerCase() === other.participant.toLowerCase() &&
      this.asset.toLowerCase() === other.asset.toLowerCase() &&
      this.amount === other.amount
    );
  }

  /**
   * Create a new allocation with updated amount
   */
  withAmount(newAmount: string): Allocation {
    return new Allocation(this.participant, this.asset, newAmount);
  }

  /**
   * Convert to Yellow Network format
   */
  toYellowFormat(): {
    participant: string;
    asset: string;
    amount: string;
  } {
    return {
      participant: this.participant,
      asset: this.asset.toLowerCase(),
      amount: this.amount,
    };
  }
}
