import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const UserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: any }>();

    // Try to get userId from authenticated user (JWT)
    if (request.user?.id) {
      return request.user.id;
    }

    // Fallback to query parameter (for fingerprint users)
    const userId = request.query.userId as string | undefined;
    return userId || null;
  },
);
