-- P2-5.1: Settlement Disputes
CREATE TABLE "settlement_disputes" (
  "dispute_id" TEXT NOT NULL,
  "settlement_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_sub" TEXT NOT NULL,
  "reason_code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "evidence_ids" JSONB,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "admin_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "settlement_disputes_pkey" PRIMARY KEY ("dispute_id")
);

CREATE INDEX "settlement_disputes_tenant_id_status_created_at_idx" ON "settlement_disputes"("tenant_id", "status", "created_at");
CREATE INDEX "settlement_disputes_settlement_id_user_sub_status_idx" ON "settlement_disputes"("settlement_id", "user_sub", "status");
