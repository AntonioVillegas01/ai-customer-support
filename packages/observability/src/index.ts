import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { trace, type Tracer } from '@opentelemetry/api';
import { Langfuse } from 'langfuse';

export interface ObservabilityOptions {
  serviceName: string;
  otlpEndpoint?: string;
  langfuse?: {
    publicKey: string;
    secretKey: string;
    baseUrl?: string;
  };
}

let sdk: NodeSDK | null = null;
let langfuseClient: Langfuse | null = null;

/**
 * Starts OpenTelemetry (when an OTLP endpoint is configured) and Langfuse
 * (when keys are configured). Both are optional: the platform must run and
 * degrade gracefully without external observability backends.
 */
export function startObservability(options: ObservabilityOptions): void {
  if (options.otlpEndpoint !== undefined && options.otlpEndpoint.length > 0) {
    sdk = new NodeSDK({
      resource: resourceFromAttributes({ 'service.name': options.serviceName }),
      traceExporter: new OTLPTraceExporter({ url: options.otlpEndpoint }),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
  }
  if (
    options.langfuse !== undefined &&
    options.langfuse.publicKey.length > 0 &&
    options.langfuse.secretKey.length > 0
  ) {
    langfuseClient = new Langfuse({
      publicKey: options.langfuse.publicKey,
      secretKey: options.langfuse.secretKey,
      ...(options.langfuse.baseUrl !== undefined && options.langfuse.baseUrl.length > 0
        ? { baseUrl: options.langfuse.baseUrl }
        : {}),
    });
  }
}

export async function shutdownObservability(): Promise<void> {
  await Promise.allSettled([sdk?.shutdown(), langfuseClient?.shutdownAsync()]);
  sdk = null;
  langfuseClient = null;
}

export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

export interface AiTraceInput {
  organizationId: string;
  conversationId: string | null;
  kind: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  status: string;
  failureReason?: string | null;
}

/** Records an AI run trace to Langfuse when configured. Never sends content. */
export function traceAiRun(input: AiTraceInput): void {
  if (langfuseClient === null) return;
  langfuseClient.trace({
    name: `ai.${input.kind}`,
    metadata: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      promptVersion: input.promptVersion,
      status: input.status,
      failureReason: input.failureReason ?? null,
    },
  });
  langfuseClient.generation({
    name: `ai.${input.kind}.generation`,
    model: input.model,
    usage: { input: input.inputTokens, output: input.outputTokens },
    metadata: { latencyMs: input.latencyMs, estimatedCostUsd: input.estimatedCostUsd },
  });
}
