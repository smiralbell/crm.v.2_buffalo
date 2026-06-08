-- CreateTable "instantly_webhooks"
CREATE TABLE IF NOT EXISTS "instantly_webhooks" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "event_type" VARCHAR(255),
    "email" VARCHAR(255),
    "campaign_id" VARCHAR(255),
    "campaign_name" VARCHAR(255),
    "payload" JSONB,
    "status" VARCHAR(100),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_instantly_webhooks_event_type" ON "instantly_webhooks"("event_type");
CREATE INDEX IF NOT EXISTS "idx_instantly_webhooks_email" ON "instantly_webhooks"("email");
CREATE INDEX IF NOT EXISTS "idx_instantly_webhooks_campaign_id" ON "instantly_webhooks"("campaign_id");
CREATE INDEX IF NOT EXISTS "idx_instantly_webhooks_created_at" ON "instantly_webhooks"("created_at");
