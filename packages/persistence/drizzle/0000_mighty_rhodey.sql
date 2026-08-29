CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid,
	"kind" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"estimated_cost_usd" numeric(12, 6) NOT NULL,
	"retrieved_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_errors" jsonb,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_runs_kind_check" CHECK ("ai_runs"."kind" in ('generation', 'classification', 'summarization', 'suggestion', 'embedding')),
	CONSTRAINT "ai_runs_status_check" CHECK ("ai_runs"."status" in ('succeeded', 'failed', 'abstained'))
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"title" text NOT NULL,
	"section" text,
	"url" text,
	"content" text NOT NULL,
	"content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid,
	"status" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"subject" text,
	"assigned_agent_id" uuid,
	"escalation_reason_code" text,
	"language" text,
	"intent" text,
	"sentiment" text,
	"urgency" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_message_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_status_check" CHECK ("conversations"."status" in ('open_ai', 'pending_customer', 'escalated', 'assigned_human', 'resolved', 'closed')),
	CONSTRAINT "conversations_priority_check" CHECK ("conversations"."priority" in ('low', 'normal', 'high', 'urgent'))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_id" text,
	"email" text,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"status" text NOT NULL,
	"storage_key" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_versions_document_version_unique" UNIQUE("document_id","version"),
	CONSTRAINT "document_versions_status_check" CHECK ("document_versions"."status" in ('pending', 'processing', 'indexed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"rating" text NOT NULL,
	"comment" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_rating_check" CHECK ("feedback"."rating" in ('up', 'down')),
	CONSTRAINT "feedback_source_check" CHECK ("feedback"."source" in ('customer', 'agent'))
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"document_version_id" uuid,
	"status" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_jobs_status_check" CHECK ("ingestion_jobs"."status" in ('pending', 'processing', 'indexed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "internal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"active_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "knowledge_sources_type_check" CHECK ("knowledge_sources"."type" in ('file', 'url', 'faq'))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "memberships_user_id_organization_id_pk" PRIMARY KEY("user_id","organization_id"),
	CONSTRAINT "memberships_role_check" CHECK ("memberships"."role" in ('owner', 'admin', 'agent', 'analyst'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"processing_state" text NOT NULL,
	"idempotency_key" text,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_role_check" CHECK ("messages"."role" in ('customer', 'assistant', 'agent', 'system')),
	CONSTRAINT "messages_processing_state_check" CHECK ("messages"."processing_state" in ('accepted', 'processing', 'delivered', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"system_prompt" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_versions_name_version_unique" UNIQUE("name","version")
);
--> statement-breakpoint
CREATE TABLE "sandbox_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_number" text NOT NULL,
	"customer_email" text NOT NULL,
	"status" text NOT NULL,
	"shipping_address" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sandbox_orders_org_order_number_unique" UNIQUE("organization_id","order_number")
);
--> statement-breakpoint
CREATE TABLE "sandbox_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sandbox_returns_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "tool_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"requires_confirmation" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_definitions_org_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "tool_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"args_json" jsonb NOT NULL,
	"result_summary" text,
	"error_code" text,
	"idempotency_key" text NOT NULL,
	"confirmation_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_executions_org_idempotency_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "tool_executions_status_check" CHECK ("tool_executions"."status" in ('proposed', 'awaiting_confirmation', 'confirmed', 'rejected', 'executing', 'succeeded', 'failed', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_month" text NOT NULL,
	"ai_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"tokens" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_records_org_period_unique" UNIQUE("organization_id","period_month")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_allowed_origins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"widget_config_id" uuid NOT NULL,
	"origin" text NOT NULL,
	CONSTRAINT "widget_allowed_origins_config_origin_unique" UNIQUE("widget_config_id","origin")
);
--> statement-breakpoint
CREATE TABLE "widget_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"title" text NOT NULL,
	"primary_color" text NOT NULL,
	"locale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "widget_configs_public_key_unique" UNIQUE("public_key")
);
--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_agent_id_users_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_orders" ADD CONSTRAINT "sandbox_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_returns" ADD CONSTRAINT "sandbox_returns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_returns" ADD CONSTRAINT "sandbox_returns_order_id_sandbox_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sandbox_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_definitions" ADD CONSTRAINT "tool_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_allowed_origins" ADD CONSTRAINT "widget_allowed_origins_widget_config_id_widget_configs_id_fk" FOREIGN KEY ("widget_config_id") REFERENCES "public"."widget_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_configs" ADD CONSTRAINT "widget_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_runs_org_created_idx" ON "ai_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_events_org_occurred_desc_idx" ON "audit_events" USING btree ("organization_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "chunks_content_tsv_gin_idx" ON "chunks" USING gin ("content_tsv");--> statement-breakpoint
CREATE INDEX "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunks_org_document_version_idx" ON "chunks" USING btree ("organization_id","document_version_id");--> statement-breakpoint
CREATE INDEX "conversations_org_status_idx" ON "conversations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "conversations_org_assigned_agent_idx" ON "conversations" USING btree ("organization_id","assigned_agent_id");--> statement-breakpoint
CREATE INDEX "conversations_org_created_desc_idx" ON "conversations" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_external_id_unique" ON "customers" USING btree ("organization_id","external_id") WHERE "customers"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "customers_organization_id_idx" ON "customers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "document_versions_org_document_idx" ON "document_versions" USING btree ("organization_id","document_id");--> statement-breakpoint
CREATE INDEX "documents_org_source_idx" ON "documents" USING btree ("organization_id","source_id");--> statement-breakpoint
CREATE INDEX "feedback_org_conversation_idx" ON "feedback" USING btree ("organization_id","conversation_id");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_org_source_idx" ON "ingestion_jobs" USING btree ("organization_id","source_id");--> statement-breakpoint
CREATE INDEX "internal_notes_org_conversation_idx" ON "internal_notes" USING btree ("organization_id","conversation_id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_organization_id_idx" ON "knowledge_sources" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "memberships_organization_user_idx" ON "memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_org_conversation_idempotency_unique" ON "messages" USING btree ("organization_id","conversation_id","idempotency_key") WHERE "messages"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "messages_org_conversation_created_idx" ON "messages" USING btree ("organization_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_unprocessed_idx" ON "outbox_events" USING btree ("processed_at") WHERE "outbox_events"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "sandbox_returns_org_order_idx" ON "sandbox_returns" USING btree ("organization_id","order_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tool_executions_org_conversation_idx" ON "tool_executions" USING btree ("organization_id","conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "widget_configs_organization_id_idx" ON "widget_configs" USING btree ("organization_id");
--> statement-breakpoint
-- Enable tenant RLS as defense in depth. Policies are not FORCEd so the table owner used by local development can still bypass RLS until an unprivileged app role is introduced. Application queries must still tenant-scope explicitly.
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "memberships_tenant_isolation" ON "memberships" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "api_keys_tenant_isolation" ON "api_keys" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "widget_configs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "widget_configs_tenant_isolation" ON "widget_configs" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "customers_tenant_isolation" ON "customers" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "conversations_tenant_isolation" ON "conversations" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "messages_tenant_isolation" ON "messages" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "internal_notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "internal_notes_tenant_isolation" ON "internal_notes" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "knowledge_sources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "knowledge_sources_tenant_isolation" ON "knowledge_sources" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "documents_tenant_isolation" ON "documents" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "document_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "document_versions_tenant_isolation" ON "document_versions" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "chunks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "chunks_tenant_isolation" ON "chunks" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ingestion_jobs_tenant_isolation" ON "ingestion_jobs" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "ai_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "ai_runs_tenant_isolation" ON "ai_runs" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "tool_definitions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tool_definitions_tenant_isolation" ON "tool_definitions" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "tool_executions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tool_executions_tenant_isolation" ON "tool_executions" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "feedback_tenant_isolation" ON "feedback" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "audit_events_tenant_isolation" ON "audit_events" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "outbox_events_tenant_isolation" ON "outbox_events" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "usage_records" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "usage_records_tenant_isolation" ON "usage_records" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "sandbox_orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "sandbox_orders_tenant_isolation" ON "sandbox_orders" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
ALTER TABLE "sandbox_returns" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "sandbox_returns_tenant_isolation" ON "sandbox_returns" USING ("organization_id" = current_setting('app.current_org_id', true)::uuid) WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);
--> statement-breakpoint
-- audit_events is append-only by convention: application code exposes no update/delete methods; keep UPDATE/DELETE privileges revoked from future unprivileged app roles.
