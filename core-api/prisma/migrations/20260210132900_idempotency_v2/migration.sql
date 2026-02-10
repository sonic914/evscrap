-- AlterTable: idempotency_records → v2 (scope + status + response_status)
-- 기존 테이블 드롭 후 재생성 (dev 데이터 없음)

DROP TABLE IF EXISTS "idempotency_records";

CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_scope_type_scope_id_endpoint_idempotency_key" ON "idempotency_records"("scope_type", "scope_id", "endpoint", "idempotency_key");
