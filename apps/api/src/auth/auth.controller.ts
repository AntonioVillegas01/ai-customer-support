import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { loginRequestSchema, registerRequestSchema } from '@acs/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type RequestWithContext } from '../common/types';
import { AuthGuard, CsrfGuard } from './guards';
import { SessionService } from './session.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly sessions: SessionService) {}

  @Post('register')
  async register(@Body(new ZodValidationPipe(registerRequestSchema)) body: { email: string; password: string; name: string }): Promise<{ userId: string; organizationId: string }> {
    return this.sessions.register(body);
  }

  @Post('login')
  async login(@Body(new ZodValidationPipe(loginRequestSchema)) body: { email: string; password: string }, @Req() req: RequestWithContext, @Res({ passthrough: true }) res: Response): Promise<{ user: unknown; csrfToken: string }> {
    const result = await this.sessions.login(body.email, body.password, req.ip ?? 'unknown');
    res.cookie('acs_session', result.token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.cookie('acs_csrf', result.csrfToken, { httpOnly: false, secure: true, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
    return { user: result.user, csrfToken: result.csrfToken };
  }

  @UseGuards(AuthGuard, CsrfGuard)
  @Post('logout')
  async logout(@Req() req: RequestWithContext, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    const cookie = req.header('cookie') ?? '';
    const token = cookie.split(';').map((p) => p.trim()).find((p) => p.startsWith('acs_session='))?.slice('acs_session='.length);
    if (token !== undefined) await this.sessions.logout(token);
    res.clearCookie('acs_session');
    res.clearCookie('acs_csrf');
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: RequestWithContext): { user: unknown } {
    return { user: req.context?.auth ?? null };
  }
}
