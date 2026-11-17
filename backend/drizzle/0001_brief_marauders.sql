CREATE TABLE IF NOT EXISTS "ai_knowledge_books" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'GENERAL' NOT NULL,
	"source_type" text DEFAULT 'MANUAL' NOT NULL,
	"source_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_knowledge_items" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"book_id" text,
	"title" text NOT NULL,
	"category" text DEFAULT 'FAQ' NOT NULL,
	"content" text NOT NULL,
	"source_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_mcp_servers" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"transport" text DEFAULT 'HTTP' NOT NULL,
	"endpoint_url" text NOT NULL,
	"auth_type" text DEFAULT 'NONE' NOT NULL,
	"auth_header_name" text DEFAULT 'X-API-Key' NOT NULL,
	"auth_token" text,
	"cached_tools" text DEFAULT '[]' NOT NULL,
	"disabled_tools" text DEFAULT '[]' NOT NULL,
	"last_synced_at" timestamp,
	"last_error" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_skills" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'CUSTOM' NOT NULL,
	"trigger_hint" text,
	"instructions" text NOT NULL,
	"linked_tools" text DEFAULT '[]' NOT NULL,
	"source_type" text DEFAULT 'MANUAL' NOT NULL,
	"source_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auto_reply_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"keyword" text NOT NULL,
	"match_type" text DEFAULT 'CONTAINS' NOT NULL,
	"reply_text" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canned_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"short_code" text NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'Umum' NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"channel" text NOT NULL,
	"name" text NOT NULL,
	"account_id" text NOT NULL,
	"access_token" text,
	"verify_token" text,
	"webhook_secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_connect_links" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"token" text NOT NULL,
	"channel" text NOT NULL,
	"label" text,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_channel_account_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channel_connect_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comment_automations" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"name" text NOT NULL,
	"channel" text DEFAULT 'ALL' NOT NULL,
	"keyword" text NOT NULL,
	"match_type" text DEFAULT 'CONTAINS' NOT NULL,
	"reply_comment" text,
	"send_dm" boolean DEFAULT false NOT NULL,
	"dm_text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"trigger_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_name" text,
	"owner_email" text,
	"owner_phone" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"license_key" text,
	"license_status" text DEFAULT 'UNLICENSED' NOT NULL,
	"license_plan" text DEFAULT 'Belum Diaktivasi' NOT NULL,
	"license_plan_slug" text,
	"license_period" text DEFAULT 'monthly' NOT NULL,
	"license_price_amount" integer DEFAULT 0 NOT NULL,
	"license_started_at" timestamp,
	"license_expires_at" timestamp,
	"license_features_json" text,
	"trial_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"contact_id" text NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"handle" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"channel" text DEFAULT 'INSTAGRAM' NOT NULL,
	"stage" text DEFAULT 'IDE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'AGENT' NOT NULL,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"role_id" text,
	"permissions" text DEFAULT '["dashboard","conversations","contacts"]' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_agents_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"scope" text DEFAULT 'CONVERSATION_LABEL' NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "csat_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"conversation_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"waha_session" text,
	"assigned_agent_id" text,
	"assigned_agent_name" text,
	"token" text NOT NULL,
	"trigger_type" text DEFAULT 'MANUAL' NOT NULL,
	"profile_id" text,
	"profile_name" text,
	"snapshot_json" text,
	"criteria_scores_json" text,
	"rating" integer,
	"overall_score" double precision,
	"feedback" text,
	"conversation_started_at" timestamp,
	"conversation_resolved_at" timestamp,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"submitted_at" timestamp,
	CONSTRAINT "csat_responses_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'Umum' NOT NULL,
	"channel" text DEFAULT 'ALL' NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"price" integer DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"channel" text NOT NULL,
	"channel_account_id" text,
	"waha_session" text,
	"post_type" text DEFAULT 'FEED' NOT NULL,
	"caption" text NOT NULL,
	"media_url" text,
	"target_chat_id" text,
	"target_contacts_json" text,
	"status_style_json" text,
	"viewer_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"published_at" timestamp,
	"external_post_id" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"channel" text NOT NULL,
	"channel_account_id" text NOT NULL,
	"post_id" text,
	"post_caption" text,
	"external_comment_id" text,
	"author_name" text NOT NULL,
	"author_handle" text,
	"content" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reply_text" text,
	"replied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"event" text NOT NULL,
	"target_url" text NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"error_message" text,
	"payload_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_status_views" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text DEFAULT 'company_default' NOT NULL,
	"post_id" text NOT NULL,
	"viewer_jid" text NOT NULL,
	"viewer_phone" text,
	"contact_id" text,
	"viewer_name" text,
	"ack_status" integer DEFAULT 3 NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_recipients" DROP CONSTRAINT IF EXISTS "campaign_recipients_waha_message_id_unique";--> statement-breakpoint
ALTER TABLE "chat_messages" DROP CONSTRAINT IF EXISTS "chat_messages_waha_message_id_unique";--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_nomor_whatsapp_unique";--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_contact_id_unique";--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "nomor_whatsapp" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "birthday_settings" ADD COLUMN "company_id" text DEFAULT 'company_default' NOT NULL;--> statement-breakpoint
ALTER TABLE "birthday_settings" ADD COLUMN "channel" text DEFAULT 'WHATSAPP' NOT NULL;--> statement-breakpoint
ALTER TABLE "birthday_settings" ADD COLUMN "channel_account_id" text;--> statement-breakpoint
ALTER TABLE "birthday_settings" ADD COLUMN "waha_session" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "company_id" text DEFAULT 'company_default' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "company_id" text DEFAULT 'company_default' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "channel" text DEFAULT 'WHATSAPP' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "channel_account_id" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "company_id" text DEFAULT 'company_default' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "message_type" text DEFAULT 'TEXT' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "channel" text DEFAULT 'WHATSAPP' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "external_message_id" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "waha_session" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "sender_jid" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "sender_phone" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "sender_name" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "media_type" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "media_name" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "reply_to_message_id" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "reply_to_body" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "reply_to_sender" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "metadata_json" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "company_id" text DEFAULT 'company_default' NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "kategori" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "exclude_from_metrics" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "exclude_reason" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "company_id" text DEFAULT 'company_default' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "channel" text DEFAULT 'WHATSAPP' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "channel_account_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "external_thread_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "context_title" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "push_name" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "channel_display_name" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "waha_session" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "is_group" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "exclude_from_metrics" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "exclude_reason" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "assigned_agent_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "assigned_agent_name" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "status" text DEFAULT 'OPEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "labels" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "first_inbound_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_inbound_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "first_response_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "session_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "csat_token" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "csat_rating" integer;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "csat_overall_score" double precision;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "csat_feedback" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "csat_submitted_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_knowledge_books" ADD CONSTRAINT "ai_knowledge_books_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_knowledge_items" ADD CONSTRAINT "ai_knowledge_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_knowledge_items" ADD CONSTRAINT "ai_knowledge_items_book_id_ai_knowledge_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."ai_knowledge_books"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_mcp_servers" ADD CONSTRAINT "ai_mcp_servers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_skills" ADD CONSTRAINT "ai_skills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auto_reply_rules" ADD CONSTRAINT "auto_reply_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "channel_connect_links" ADD CONSTRAINT "channel_connect_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comment_automations" ADD CONSTRAINT "comment_automations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_agents" ADD CONSTRAINT "crm_agents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_labels" ADD CONSTRAINT "crm_labels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_roles" ADD CONSTRAINT "crm_roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "csat_responses" ADD CONSTRAINT "csat_responses_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_comments" ADD CONSTRAINT "social_comments_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whatsapp_status_views" ADD CONSTRAINT "whatsapp_status_views_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whatsapp_status_views" ADD CONSTRAINT "whatsapp_status_views_post_id_scheduled_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."scheduled_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whatsapp_status_views" ADD CONSTRAINT "whatsapp_status_views_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "birthday_settings" ADD CONSTRAINT "birthday_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_csat_token_unique" UNIQUE("csat_token");