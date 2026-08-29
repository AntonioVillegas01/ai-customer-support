import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { StableHttpError } from '../common/auth-errors';
import { type RequestWithContext } from '../common/types';
import { WidgetTokenService } from './widget-token.service';

@Injectable()
export class WidgetTokenGuard implements CanActivate {
  constructor(private readonly tokens: WidgetTokenService) {}
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithContext>();
    const auth = req.header('authorization');
    const token = auth?.startsWith('Bearer ') === true ? auth.slice(7) : null;
    if (token === null) throw new StableHttpError('INVALID_WIDGET_TOKEN', 'Widget token required');
    const claims = this.tokens.verify(token);
    if (claims === null) throw new StableHttpError('INVALID_WIDGET_TOKEN', 'Widget token invalid');
    req.context = { ...(req.context ?? { requestId: '' }), widget: claims };
    return true;
  }
}
