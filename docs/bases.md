CREATE TABLE "public"."bank_accounts" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "name" TEXT NULL,
  "iban" TEXT NULL,
  "created_at" TIMESTAMP NULL DEFAULT now() ,
  CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_accounts_iban_key" UNIQUE ("iban")
);

CREATE TABLE "public"."bank_statements" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "account_id" UUID NULL,
  "period_start" DATE NULL,
  "period_end" DATE NULL,
  "uploaded_at" TIMESTAMP NULL DEFAULT now() ,
  "file_hash" TEXT NULL,
  "original_filename" TEXT NULL,
  CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_statements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "idx_bank_statements_account_id" 
ON "public"."bank_statements" (
  "account_id" ASC
);
CREATE INDEX "idx_bank_statements_period" 
ON "public"."bank_statements" (
  "period_start" ASC,
  "period_end" ASC
);

CREATE TABLE "public"."bank_transactions" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "account_id" UUID NULL,
  "statement_id" UUID NULL,
  "date" DATE NULL,
  "amount" NUMERIC NULL,
  "description" TEXT NULL,
  "hash" TEXT NULL,
  "created_at" TIMESTAMP NULL DEFAULT now() ,
  "balance" NUMERIC NULL,
  CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_transactions_account_id_hash_key" UNIQUE ("account_id", "hash")
);
CREATE INDEX "idx_bank_transactions_account_id" 
ON "public"."bank_transactions" (
  "account_id" ASC
);
CREATE INDEX "idx_bank_transactions_statement_id" 
ON "public"."bank_transactions" (
  "statement_id" ASC
);
CREATE INDEX "idx_bank_transactions_date" 
ON "public"."bank_transactions" (
  "date" ASC
);
CREATE INDEX "idx_bank_transactions_hash" 
ON "public"."bank_transactions" (
  "hash" ASC
);
CREATE INDEX "idx_bank_transactions_balance" 
ON "public"."bank_transactions" (
  "balance" ASC
);
CREATE INDEX "idx_bank_transactions_account_date_balance" 
ON "public"."bank_transactions" (
  "account_id" ASC,
  "date" ASC,
  "balance" ASC
);


CREATE TABLE "public"."contacts" ( 
  "id" SERIAL,
  "nombre" TEXT NULL,
  "email" TEXT NULL,
  "instagram_user" TEXT NULL,
  "telefono" TEXT NULL,
  "empresa" TEXT NULL,
  "created_at" TIMESTAMP NULL DEFAULT now() ,
  "updated_at" TIMESTAMP NULL DEFAULT now() ,
  "direccion_fiscal" TEXT NULL,
  "ciudad" TEXT NULL,
  "codigo_postal" TEXT NULL,
  "pais" TEXT NULL,
  "cif" TEXT NULL,
  "iban" TEXT NULL,
  "dni" TEXT NULL,
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contacts_email_key" UNIQUE ("email"),
  CONSTRAINT "contacts_instagram_user_key" UNIQUE ("instagram_user")
);


CREATE TABLE "public"."drive_carpetas_facturas" ( 
  "id" SERIAL,
  "tipo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "ruta_id" TEXT NOT NULL,
  "created_at" TIMESTAMP NULL DEFAULT now() ,
  CONSTRAINT "drive_carpetas_facturas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drive_carpetas_facturas_tipo_nombre_key" UNIQUE ("tipo", "nombre")
);


CREATE TABLE "public"."expenses" ( 
  "id" SERIAL,
  "name" VARCHAR(255) NOT NULL,
  "date" DATE NOT NULL,
  "base_amount" NUMERIC NOT NULL,
  "iva_amount" NUMERIC NOT NULL DEFAULT 0 ,
  "total_amount" NUMERIC NOT NULL,
  "person_name" VARCHAR(255) NULL,
  "project" VARCHAR(255) NULL,
  "client_name" VARCHAR(255) NULL,
  "notes" TEXT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now() ,
  "updated_at" TIMESTAMP NOT NULL DEFAULT now() ,
  "deleted_at" TIMESTAMP NULL,
  "date_start" DATE NULL,
  "date_end" DATE NULL,
  "tags" ARRAY NULL DEFAULT '{}'::text[] ,
  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_expenses_date" 
ON "public"."expenses" (
  "date" ASC
);
CREATE INDEX "idx_expenses_deleted" 
ON "public"."expenses" (
  "deleted_at" ASC
);
CREATE INDEX "idx_expenses_date_start" 
ON "public"."expenses" (
  "date_start" ASC
);
CREATE INDEX "idx_expenses_date_end" 
ON "public"."expenses" (
  "date_end" ASC
);


CREATE TABLE "public"."financial_incomes" ( 
  "id" SERIAL,
  "client_name" VARCHAR(255) NOT NULL,
  "date" DATE NOT NULL,
  "base_amount" NUMERIC NOT NULL,
  "iva_amount" NUMERIC NOT NULL DEFAULT 0 ,
  "total_amount" NUMERIC NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending'::character varying ,
  "project" VARCHAR(255) NULL,
  "invoice_id" INTEGER NULL,
  "notes" TEXT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now() ,
  "updated_at" TIMESTAMP NOT NULL DEFAULT now() ,
  "deleted_at" TIMESTAMP NULL,
  CONSTRAINT "financial_incomes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_financial_incomes_date" 
ON "public"."financial_incomes" (
  "date" ASC
);
CREATE INDEX "idx_financial_incomes_deleted" 
ON "public"."financial_incomes" (
  "deleted_at" ASC
);
CREATE INDEX "idx_financial_incomes_status" 
ON "public"."financial_incomes" (
  "status" ASC
);


CREATE TABLE "public"."financial_settings" ( 
  "id" INTEGER NOT NULL DEFAULT 1 ,
  "corporate_tax_percent" NUMERIC NOT NULL DEFAULT 25.00 ,
  "updated_at" TIMESTAMP NOT NULL DEFAULT now() ,
  CONSTRAINT "financial_settings_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "public"."fixed_expenses" ( 
  "id" SERIAL,
  "name" VARCHAR(255) NOT NULL,
  "amount" NUMERIC NOT NULL,
  "has_iva" BOOLEAN NOT NULL DEFAULT false ,
  "iva_percent" NUMERIC NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true ,
  "created_at" TIMESTAMP NOT NULL DEFAULT now() ,
  "updated_at" TIMESTAMP NOT NULL DEFAULT now() ,
  "deleted_at" TIMESTAMP NULL,
  "tags" ARRAY NULL DEFAULT '{}'::text[] ,
  CONSTRAINT "fixed_expenses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_fixed_expenses_active" 
ON "public"."fixed_expenses" (
  "is_active" ASC,
  "deleted_at" ASC
);


CREATE TABLE "public"."invoice_template" ( 
  "id" INTEGER NOT NULL DEFAULT 1 ,
  "html_content" TEXT NOT NULL,
  "updated_at" TIMESTAMP NOT NULL DEFAULT now() ,
  CONSTRAINT "invoice_template_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."invoices" ( 
  "id" SERIAL,
  "invoice_number" VARCHAR(50) NOT NULL,
  "client_name" VARCHAR(255) NOT NULL,
  "client_email" VARCHAR(255) NULL,
  "client_address" TEXT NULL,
  "client_tax_id" VARCHAR(50) NULL,
  "issue_date" DATE NOT NULL DEFAULT CURRENT_DATE ,
  "due_date" DATE NULL,
  "services" JSONB NULL,
  "subtotal" NUMERIC NOT NULL DEFAULT 0 ,
  "iva" NUMERIC NOT NULL DEFAULT 0 ,
  "total" NUMERIC NOT NULL DEFAULT 0 ,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft'::character varying ,
  "pdf_drive_file_id" VARCHAR(255) NULL,
  "pdf_drive_url" TEXT NULL,
  "deleted_at" TIMESTAMP NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now() ,
  "updated_at" TIMESTAMP NOT NULL DEFAULT now() ,
  "company_address" TEXT NULL,
  "company_name" TEXT NULL DEFAULT 'BUFFALO AI'::text ,
  "client_company_name" TEXT NULL,
  "sent_to_drive" BOOLEAN NULL DEFAULT false ,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number")
);
CREATE INDEX "idx_invoices_sent_to_drive" 
ON "public"."invoices" (
  "sent_to_drive" ASC
);

CREATE TABLE "public"."leads" ( 
  "id" SERIAL,
  "contact_id" INTEGER NOT NULL,
  "estado" TEXT NULL DEFAULT 'frio'::text ,
  "origen_principal" TEXT NULL,
  "prioridad" TEXT NULL DEFAULT 'media'::text ,
  "score" INTEGER NULL,
  "ultima_interaccion" TIMESTAMP NULL,
  "created_at" TIMESTAMP NULL DEFAULT now() ,
  "updated_at" TIMESTAMP NULL DEFAULT now() ,
  "pipeline_id" INTEGER NULL,
  "pipeline_stage_id" INTEGER NULL,
  "valor" NUMERIC NULL,
  "position" INTEGER NULL,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "leads_contact_id_key" UNIQUE ("contact_id")
);


CREATE TABLE "public"."messages" ( 
  "id" SERIAL,
  "contact_id" INTEGER NOT NULL,
  "lead_id" INTEGER NULL,
  "canal" TEXT NOT NULL,
  "direccion" TEXT NOT NULL,
  "contenido" TEXT NOT NULL,
  "timestamp" TIMESTAMP NULL DEFAULT now() ,
  "raw_payload" JSONB NULL,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE INDEX "idx_messages_contact_id" 
ON "public"."messages" (
  "contact_id" ASC
);
CREATE INDEX "idx_messages_lead_id" 
ON "public"."messages" (
  "lead_id" ASC
);


CREATE TABLE "public"."pipeline_cards" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "pipeline_id" UUID NOT NULL,
  "entity_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "stage_color" TEXT NULL DEFAULT '#3B82F6'::text ,
  "position" INTEGER NOT NULL DEFAULT 0 ,
  "tags" ARRAY NULL,
  "created_at" TIMESTAMP NULL DEFAULT now() ,
  "updated_at" TIMESTAMP NULL DEFAULT now() ,
  "deleted_at" TIMESTAMP NULL,
  "capture_date" TIMESTAMP NULL,
  "amount" NUMERIC NULL,
  "notes" TEXT NULL,
  CONSTRAINT "pipeline_cards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pipeline_cards_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);


CREATE TABLE "public"."pipelines" ( 
  "id" UUID NOT NULL DEFAULT gen_random_uuid() ,
  "name" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "created_at" TIMESTAMP NULL DEFAULT now() ,
  CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);


CREATE TABLE "public"."salaries" ( 
  "id" SERIAL,
  "person_name" VARCHAR(255) NOT NULL,
  "date" DATE NOT NULL,
  "amount" NUMERIC NOT NULL,
  "notes" TEXT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT now() ,
  "updated_at" TIMESTAMP NOT NULL DEFAULT now() ,
  "deleted_at" TIMESTAMP NULL,
  "tags" ARRAY NULL DEFAULT '{}'::text[] ,
  CONSTRAINT "salaries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_salaries_date" 
ON "public"."salaries" (
  "date" ASC
);
CREATE INDEX "idx_salaries_deleted" 
ON "public"."salaries" (
  "deleted_at" ASC
);


CREATE TABLE "public"."tasks" ( 
  "id" SERIAL,
  "lead_id" INTEGER NULL,
  "contact_id" INTEGER NULL,
  "tarea" TEXT NOT NULL,
  "pendiente" BOOLEAN NOT NULL DEFAULT true ,
  "fecha" TIMESTAMP NULL,
  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
