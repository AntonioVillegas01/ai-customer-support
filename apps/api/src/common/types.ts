import { type Request } from 'express';
import { type Permission } from '@acs/domain';

export interface MembershipContext {
  organizationId: string;
  role: string;
}

export interface AuthContext {
  userId: string;
  email: string;
  memberships: MembershipContext[];
}

export interface WidgetContext {
  organizationId: string;
  widgetConfigId: string;
  customerId: string | null;
  sessionId: string;
}

export interface RequestContext {
  requestId: string;
  auth?: AuthContext;
  org?: MembershipContext;
  widget?: WidgetContext;
  apiKey?: { organizationId: string; apiKeyId: string; scopes: string[] };
  permissions?: Permission[];
}

export type RequestWithContext = Request & { context?: RequestContext };
