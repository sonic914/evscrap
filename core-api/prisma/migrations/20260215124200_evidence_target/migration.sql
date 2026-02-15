-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "target_id" TEXT,
ADD COLUMN     "target_type" TEXT;

-- CreateIndex
CREATE INDEX "evidence_tenant_id_target_type_target_id_uploaded_at_idx" ON "evidence"("tenant_id", "target_type", "target_id", "uploaded_at");

-- RenameIndex
ALTER INDEX "idempotency_records_scope_type_scope_id_endpoint_idempotency_ke" RENAME TO "idempotency_records_scope_type_scope_id_endpoint_idempotenc_key";
