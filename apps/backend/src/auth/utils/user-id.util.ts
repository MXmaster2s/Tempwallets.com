import { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Extract userId from request - tries JWT first, falls back to query param
 */
export function extractUserId(context: ExecutionContext): string | null {
  const request = context.switchToHttp().getRequest<Request & { user?: any }>();

  // Try to get userId from authenticated user (JWT)
  if (request.user?.id) {
    return request.user.id;
  }

  // Fallback to query parameter (for fingerprint users)
  const userId = request.query.userId as string | undefined;
  return userId || null;
}








