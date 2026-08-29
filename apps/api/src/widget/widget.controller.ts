import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { widgetTokenRequestSchema } from '@acs/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WidgetTokenService } from './widget-token.service';

@ApiTags('widget')
@Controller('widget')
export class WidgetController {
  constructor(private readonly tokens: WidgetTokenService) {}
  @Post('token')
  async token(@Body(new ZodValidationPipe(widgetTokenRequestSchema)) body: { widgetKey: string; customer?: { externalId: string; email?: string; name?: string } }, @Headers('origin') origin: string | undefined): Promise<unknown> {
    return this.tokens.mint(body.widgetKey, origin, body.customer);
  }
}
