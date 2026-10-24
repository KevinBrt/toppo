CREATE TABLE "mail_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"security" text NOT NULL,
	"username" text,
	"password_sealed" text,
	"from_address" text NOT NULL,
	"from_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_settings_single_row" CHECK ("mail_settings"."id" = 1),
	CONSTRAINT "mail_settings_port_range" CHECK ("mail_settings"."port" between 1 and 65535),
	CONSTRAINT "mail_settings_security_check" CHECK ("mail_settings"."security" in ('starttls', 'tls', 'none')),
	CONSTRAINT "mail_settings_credentials_together" CHECK (("mail_settings"."username" is null) = ("mail_settings"."password_sealed" is null))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_locale_check" CHECK ("users"."locale" in ('en', 'fr'));