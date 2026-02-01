/**
 * CLOSE SESSION DTO
 *
 * Application Layer - Use Case Input/Output
 *
 * Close an app session, returning funds to unified balance.
 */

export class CloseSessionDto {
  userId!: string;
  appSessionId!: string;
  chain!: string;
}

export class CloseSessionResultDto {
  appSessionId!: string;
  closed!: boolean;
}
