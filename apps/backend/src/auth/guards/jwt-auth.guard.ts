import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable, firstValueFrom } from 'rxjs';
import { OPTIONAL_AUTH_KEY } from '../decorators/optional-auth.decorator.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as optional auth
    const isOptional = this.reflector.getAllAndOverride<boolean>(
      OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isOptional) {
      // Try to authenticate, but don't fail if no token
      try {
        return await this.resolveCanActivate(context);
      } catch {
        return true; // Allow request to proceed without auth
      }
    }

    return this.resolveCanActivate(context);
  }

  private async resolveCanActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const result = super.canActivate(context);
    if (typeof result === 'boolean') {
      return result;
    }
    if (result instanceof Promise) {
      return result;
    }
    // For Observable
    return firstValueFrom(result);
  }
}
