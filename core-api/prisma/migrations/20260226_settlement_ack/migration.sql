-- CreateTable: settlement_acks (P2-4.1 사용자 정산 확인)
CREATE TABLE "settlement_acks" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "user_sub" TEXT NOT NULL,
    "acked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "settlement_acks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_acks_settlement_id_acked_at_idx" ON "settlement_acks"("settlement_id", "acked_at");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_acks_settlement_id_user_sub_key" ON "settlement_acks"("settlement_id", "user_sub");

-- AddForeignKey
ALTER TABLE "settlement_acks" ADD CONSTRAINT "settlement_acks_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("settlement_id") ON DELETE CASCADE ON UPDATE CASCADE;
