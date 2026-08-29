import { type ToolHandler, type ToolRegistryPort } from '@acs/application';
import { type OrganizationId } from '@acs/domain';

/** Registry fake keyed by tenant to prove tool tenant-scoping in tests. */
export class InMemoryToolRegistry implements ToolRegistryPort {
  private readonly byOrg = new Map<string, Map<string, ToolHandler>>();

  register(organizationId: string, handler: ToolHandler): this {
    const tools = this.byOrg.get(organizationId) ?? new Map<string, ToolHandler>();
    tools.set(handler.name, handler);
    this.byOrg.set(organizationId, tools);
    return this;
  }

  async getEnabled(organizationId: OrganizationId, name: string): Promise<ToolHandler | null> {
    return this.byOrg.get(organizationId)?.get(name) ?? null;
  }

  async listEnabled(organizationId: OrganizationId): Promise<ToolHandler[]> {
    return [...(this.byOrg.get(organizationId)?.values() ?? [])];
  }
}
