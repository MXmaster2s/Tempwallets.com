/**
 * DOMAIN ERROR
 *
 * Domain Layer - Pure TypeScript, no framework dependencies
 *
 * Base class for all domain-level errors representing business rule violations.
 * These errors are thrown by entities and value objects when invariants are violated.
 *
 * Examples:
 * - Cannot update closed session
 * - Participant not in session
 * - Invalid allocation amount
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DomainError);
    }
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, identifier: string) {
    super(`${entity} not found: ${identifier}`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
