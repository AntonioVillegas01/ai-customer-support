import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { type ToolHandler, type ToolRegistryPort } from '@acs/application';
import { type OrganizationId } from '@acs/domain';
import { sandboxOrders, sandboxReturns, toolDefinitions, type Database } from '@acs/persistence';
import { DB } from '../common/tokens';

const lookupInput = z.object({ orderNumber: z.string().min(1).max(100), customerEmail: z.string().email().optional() });
const orderOutput = z.object({ orderNumber: z.string(), status: z.string(), shippingAddress: z.string(), items: z.array(z.record(z.unknown())) });
const returnInput = z.object({ orderNumber: z.string().min(1), reason: z.string().max(500).optional() });
const returnOutput = z.object({ returnId: z.string(), status: z.string(), orderNumber: z.string() });
const addressInput = z.object({ orderNumber: z.string().min(1), shippingAddress: z.string().min(5).max(500) });
const addressOutput = z.object({ orderNumber: z.string(), status: z.string(), shippingAddress: z.string() });

type Handler = ToolHandler<z.ZodTypeAny, z.ZodTypeAny>;

@Injectable()
export class SandboxToolRegistry implements ToolRegistryPort {
  constructor(@Inject(DB) private readonly db: Database) {}

  async getEnabled(organizationId: OrganizationId, name: string): Promise<Handler | null> {
    const enabled = await this.enabledNames(organizationId);
    if (!enabled.has(name)) return null;
    return this.handlers(organizationId).find((h) => h.name === name) ?? null;
  }

  async listEnabled(organizationId: OrganizationId): Promise<Handler[]> {
    const enabled = await this.enabledNames(organizationId);
    return this.handlers(organizationId).filter((h) => enabled.has(h.name));
  }

  private async enabledNames(organizationId: OrganizationId): Promise<Set<string>> {
    const rows = await this.db.select({ name: toolDefinitions.name }).from(toolDefinitions).where(and(eq(toolDefinitions.organizationId, organizationId), eq(toolDefinitions.enabled, true)));
    const names = new Set(rows.map((r) => r.name));
    if (names.size === 0) ['lookup_order', 'create_return', 'update_shipping_address'].forEach((n) => names.add(n));
    return names;
  }

  private handlers(organizationId: OrganizationId): Handler[] {
    return [
      {
        name: 'lookup_order', description: 'Look up an order by number.', inputSchema: lookupInput, outputSchema: orderOutput, risk: 'read_only', requiresConfirmation: false, timeoutMs: 3000,
        summarize: (args: z.infer<typeof lookupInput>) => `Look up order ${args.orderNumber}`,
        execute: async (_ctx, args: z.infer<typeof lookupInput>) => {
          const rows = await this.db.select().from(sandboxOrders).where(and(eq(sandboxOrders.organizationId, organizationId), eq(sandboxOrders.orderNumber, args.orderNumber))).limit(1);
          const order = rows[0];
          if (order === undefined || (args.customerEmail !== undefined && order.customerEmail.toLowerCase() !== args.customerEmail.toLowerCase())) throw new Error('order not found');
          return { orderNumber: order.orderNumber, status: order.status, shippingAddress: order.shippingAddress, items: order.items };
        },
        sanitizeResult: (r: z.infer<typeof orderOutput>) => r,
      },
      {
        name: 'create_return', description: 'Create a return request for an order.', inputSchema: returnInput, outputSchema: returnOutput, risk: 'consequential', requiresConfirmation: true, timeoutMs: 5000,
        summarize: (args: z.infer<typeof returnInput>) => `Create a return request for order ${args.orderNumber}`,
        execute: async (ctx, args: z.infer<typeof returnInput>) => {
          const orders = await this.db.select().from(sandboxOrders).where(and(eq(sandboxOrders.organizationId, ctx.organizationId), eq(sandboxOrders.orderNumber, args.orderNumber))).limit(1);
          const order = orders[0];
          if (order === undefined) throw new Error('order not found');
          const inserted = await this.db.insert(sandboxReturns).values({ organizationId: ctx.organizationId, orderId: order.id, status: 'requested', reason: args.reason, idempotencyKey: ctx.idempotencyKey }).onConflictDoNothing().returning({ id: sandboxReturns.id, status: sandboxReturns.status });
          const existing = inserted[0] ?? (await this.db.select({ id: sandboxReturns.id, status: sandboxReturns.status }).from(sandboxReturns).where(eq(sandboxReturns.idempotencyKey, ctx.idempotencyKey)).limit(1))[0];
          if (existing === undefined) throw new Error('return not persisted');
          return { returnId: existing.id, status: existing.status, orderNumber: order.orderNumber };
        },
        sanitizeResult: (r: z.infer<typeof returnOutput>) => r,
      },
      {
        name: 'update_shipping_address', description: 'Update an order shipping address.', inputSchema: addressInput, outputSchema: addressOutput, risk: 'consequential', requiresConfirmation: true, timeoutMs: 5000,
        summarize: (args: z.infer<typeof addressInput>) => `Update shipping address for order ${args.orderNumber}`,
        execute: async (ctx, args: z.infer<typeof addressInput>) => {
          const updated = await this.db.update(sandboxOrders).set({ shippingAddress: args.shippingAddress, updatedAt: new Date() }).where(and(eq(sandboxOrders.organizationId, ctx.organizationId), eq(sandboxOrders.orderNumber, args.orderNumber))).returning({ orderNumber: sandboxOrders.orderNumber, status: sandboxOrders.status, shippingAddress: sandboxOrders.shippingAddress });
          const row = updated[0];
          if (row === undefined) throw new Error('order not found');
          return row;
        },
        sanitizeResult: (r: z.infer<typeof addressOutput>) => r,
      },
    ];
  }
}
