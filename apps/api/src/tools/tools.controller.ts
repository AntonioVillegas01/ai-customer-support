import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfirmToolExecutionUseCase, type AuditPort, type ConversationEventPublisher, type UnitOfWork, type ToolRegistryPort } from '@acs/application';
import { asId } from '@acs/domain';
import { confirmToolRequestSchema } from '@acs/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CsrfGuard, OrgContextGuard, PermissionsGuard, RequirePermission } from '../auth/guards';
import { WidgetTokenGuard } from '../widget/widget.guard';
import { AUDIT, EVENTS, TOOL_REGISTRY, UOW } from '../common/tokens';
import { type RequestWithContext } from '../common/types';
import { StableHttpError } from '../common/auth-errors';

@ApiTags('tools')
@UseGuards(AuthGuard, CsrfGuard, OrgContextGuard, PermissionsGuard)
@Controller('orgs/:orgId/tools')
export class ToolsController {
  constructor(@Inject(TOOL_REGISTRY) private readonly tools: ToolRegistryPort) {}
  @Get() @RequirePermission('tools:configure')
  async list(@Param('orgId') orgId: string): Promise<unknown> {
    const tools = await this.tools.listEnabled(asId<'OrganizationId'>(orgId));
    return tools.map((t) => ({ name: t.name, description: t.description, risk: t.risk, requiresConfirmation: t.requiresConfirmation, enabled: true }));
  }
}

@ApiTags('tool confirmations')
@Controller('conversations/:id/tool-executions/:execId')
export class ToolConfirmController {
  constructor(@Inject(UOW) private readonly uow: UnitOfWork, @Inject(TOOL_REGISTRY) private readonly tools: ToolRegistryPort, @Inject(EVENTS) private readonly events: ConversationEventPublisher, @Inject(AUDIT) private readonly audit: AuditPort) {}

  @UseGuards(AuthGuard, CsrfGuard)
  @Post('confirm')
  async confirmStaff(@Req() req: RequestWithContext, @Param('id') id: string, @Param('execId') execId: string, @Body(new ZodValidationPipe(confirmToolRequestSchema)) body: { decision: 'approve' | 'reject' }): Promise<unknown> {
    const orgId = req.context?.auth?.memberships[0]?.organizationId;
    const userId = req.context?.auth?.userId;
    if (orgId === undefined) throw new StableHttpError('MEMBERSHIP_REQUIRED', 'Organization membership required');
    return this.run(orgId, id, execId, body.decision, { type: 'user', id: userId ?? null }, null);
  }

  @UseGuards(WidgetTokenGuard)
  @Post('widget-confirm')
  async confirmWidget(@Req() req: RequestWithContext, @Param('id') id: string, @Param('execId') execId: string, @Body(new ZodValidationPipe(confirmToolRequestSchema)) body: { decision: 'approve' | 'reject' }): Promise<unknown> {
    const widget = req.context?.widget;
    if (widget === undefined) throw new StableHttpError('INVALID_WIDGET_TOKEN', 'Widget token required');
    return this.run(widget.organizationId, id, execId, body.decision, { type: 'customer', id: widget.customerId }, widget.customerId);
  }

  private async run(orgId: string, conversationId: string, confirmationId: string, decision: 'approve' | 'reject', actor: { type: 'customer' | 'user'; id: string | null }, customerId: string | null): Promise<unknown> {
    const useCase = new ConfirmToolExecutionUseCase(this.uow, this.tools, this.events, this.audit, { now: () => new Date() });
    return useCase.execute({ organizationId: asId<'OrganizationId'>(orgId), conversationId: asId<'ConversationId'>(conversationId), confirmationId, decision, actor, customerId });
  }
}
