import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { parse } from 'cookie';
import { type Permission, roleHasPermission } from '@acs/domain';
import { SessionService } from './session.service';
import { StableHttpError } from '../common/auth-errors';
import { type RequestWithContext } from '../common/types';

export const REQUIRED_PERMISSION = 'requiredPermission';
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    const cookies = parse(req.header('cookie') ?? '');
    const token = cookies.acs_session;
    if (token === undefined) throw new StableHttpError('UNAUTHENTICATED', 'Authentication required');
    const auth = await this.sessions.resolve(token);
    if (auth === null) throw new StableHttpError('SESSION_EXPIRED', 'Session expired');
    req.context = { ...(req.context ?? { requestId: '' }), auth };
    return true;
  }
}

@Injectable()
export class OrgContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    const auth = req.context?.auth;
    if (auth === undefined) throw new StableHttpError('UNAUTHENTICATED', 'Authentication required');
    const orgId = req.params.orgId ?? auth.memberships[0]?.organizationId;
    if (typeof orgId !== 'string') throw new StableHttpError('MEMBERSHIP_REQUIRED', 'Organization membership required');
    const membership = auth.memberships.find((m) => m.organizationId === orgId);
    if (membership === undefined) throw new StableHttpError('MEMBERSHIP_REQUIRED', 'Organization membership required');
    req.context = { ...(req.context ?? { requestId: '' }), org: membership };
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]);
    if (permission === undefined) return true;
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    const role = req.context?.org?.role;
    if (role === undefined || !roleHasPermission(role as Parameters<typeof roleHasPermission>[0], permission)) {
      throw new StableHttpError('FORBIDDEN', `Missing required permission '${permission}'`);
    }
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    if (req.context?.apiKey !== undefined || req.context?.widget !== undefined) return true;
    const cookies = parse(req.header('cookie') ?? '');
    const header = req.header('x-csrf-token');
    if (cookies.acs_csrf === undefined || header === undefined || cookies.acs_csrf !== header) {
      throw new StableHttpError('CSRF_TOKEN_INVALID', 'CSRF token invalid');
    }
    return true;
  }
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    const auth = req.header('authorization');
    const token = auth?.startsWith('Bearer ') === true ? auth.slice(7) : null;
    if (token === null) throw new StableHttpError('INVALID_API_KEY', 'API key required');
    const key = await this.sessions.authenticateApiKey(token);
    if (key === null) throw new StableHttpError('INVALID_API_KEY', 'Invalid API key');
    req.context = { ...(req.context ?? { requestId: '' }), apiKey: key };
    return true;
  }
}
