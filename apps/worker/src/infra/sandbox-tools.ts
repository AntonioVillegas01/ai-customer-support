import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { type ToolHandler, type ToolRegistryPort } from '@acs/application';
import { type OrganizationId } from '@acs/domain';
import { sandboxOrders, sandboxReturns, type Database } from '@acs/persistence';

export class WorkerSandboxToolRegistry implements ToolRegistryPort {
  constructor(private readonly db: Database) {}
  async listEnabled(organizationId: OrganizationId): Promise<ToolHandler[]> { return this.handlers(organizationId); }
  async getEnabled(organizationId: OrganizationId, name: string): Promise<ToolHandler | null> { return this.handlers(organizationId).find((h) => h.name === name) ?? null; }
  private handlers(org: OrganizationId): ToolHandler[] {
    const lookupIn = z.object({ orderNumber: z.string(), customerEmail: z.string().email().optional() });
    const orderOut = z.object({ orderNumber: z.string(), status: z.string(), shippingAddress: z.string(), items: z.array(z.record(z.unknown())) });
    const returnIn = z.object({ orderNumber: z.string(), reason: z.string().optional() });
    const returnOut = z.object({ returnId: z.string(), status: z.string(), orderNumber: z.string() });
    return [
      { name: 'lookup_order', description: 'Look up an order by number.', inputSchema: lookupIn, outputSchema: orderOut, risk: 'read_only', requiresConfirmation: false, timeoutMs: 3000, summarize: (a: z.infer<typeof lookupIn>) => `Look up order ${a.orderNumber}`, execute: async (_ctx, a: z.infer<typeof lookupIn>) => { const row = (await this.db.select().from(sandboxOrders).where(and(eq(sandboxOrders.organizationId, org), eq(sandboxOrders.orderNumber, a.orderNumber))).limit(1))[0]; if (row === undefined) throw new Error('not found'); return { orderNumber: row.orderNumber, status: row.status, shippingAddress: row.shippingAddress, items: row.items }; }, sanitizeResult: (r: z.infer<typeof orderOut>) => r },
      { name: 'create_return', description: 'Create a return request for an order.', inputSchema: returnIn, outputSchema: returnOut, risk: 'consequential', requiresConfirmation: true, timeoutMs: 5000, summarize: (a: z.infer<typeof returnIn>) => `Create return for order ${a.orderNumber}`, execute: async (ctx, a: z.infer<typeof returnIn>) => { const order = (await this.db.select().from(sandboxOrders).where(and(eq(sandboxOrders.organizationId, ctx.organizationId), eq(sandboxOrders.orderNumber, a.orderNumber))).limit(1))[0]; if (order === undefined) throw new Error('not found'); const rows = await this.db.insert(sandboxReturns).values({ organizationId: ctx.organizationId, orderId: order.id, status: 'requested', reason: a.reason, idempotencyKey: ctx.idempotencyKey }).onConflictDoNothing().returning({ id: sandboxReturns.id, status: sandboxReturns.status }); const ret = rows[0] ?? (await this.db.select({ id: sandboxReturns.id, status: sandboxReturns.status }).from(sandboxReturns).where(eq(sandboxReturns.idempotencyKey, ctx.idempotencyKey)).limit(1))[0]; if (ret === undefined) throw new Error('not persisted'); return { returnId: ret.id, status: ret.status, orderNumber: order.orderNumber }; }, sanitizeResult: (r: z.infer<typeof returnOut>) => r },
    ];
  }
}
