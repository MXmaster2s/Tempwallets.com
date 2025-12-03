/**
 * Standard error response DTO for Aptos operations
 */
export class AptosErrorDto {
  statusCode: number;
  message: string;
  error?: string;
  details?: any;

  constructor(
    statusCode: number,
    message: string,
    error?: string,
    details?: any,
  ) {
    this.statusCode = statusCode;
    this.message = message;
    this.error = error;
    this.details = details;
  }
}

