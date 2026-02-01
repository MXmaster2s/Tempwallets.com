/**
 * SESSION ID VALUE OBJECT
 *
 * Domain Layer - Pure TypeScript, no framework dependencies
 *
 * Represents an app session identifier (0x-prefixed 64-character hex string).
 * Immutable value object that encapsulates validation logic.
 *
 * Yellow Network uses bytes32 for session IDs.
 */

export class SessionId {
  private constructor(private readonly _value: string) {
    this.validate();
  }

  /**
   * Create SessionId from existing value
   */
  static create(value: string): SessionId {
    return new SessionId(value);
  }

  /**
   * Generate SessionId from session definition
   * In real implementation, this would hash the definition
   * For now, we rely on Yellow Network to generate IDs
   */
  static generate(definition: any): SessionId {
    // Yellow Network generates the ID, so we'll use a placeholder
    // This will be replaced with the actual ID from Yellow Network response
    return new SessionId('0x' + '0'.repeat(64));
  }

  private validate(): void {
    if (!this._value) {
      throw new Error('Session ID cannot be empty');
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(this._value)) {
      throw new Error(
        `Invalid session ID format: ${this._value}. Expected 0x followed by 64 hex characters.`
      );
    }
  }

  get value(): string {
    return this._value;
  }

  equals(other: SessionId): boolean {
    return this._value.toLowerCase() === other._value.toLowerCase();
  }

  toString(): string {
    return this._value;
  }
}
