-- CreateTable: settlement_breakdown_items (P2-3.4)
CREATE TABLE "settlement_breakdown_items" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "quantity" DECIMAL(10,4),
    "unit" TEXT,
    "unit_price" INTEGER,
    "evidence_ref" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_breakdown_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_breakdown_items_settlement_id_category_idx" ON "settlement_breakdown_items"("settlement_id", "category");

-- CreateIndex (unique constraint: same settlement cannot have duplicate code)
CREATE UNIQUE INDEX "settlement_breakdown_items_settlement_id_code_key" ON "settlement_breakdown_items"("settlement_id", "code");

-- AddForeignKey
ALTER TABLE "settlement_breakdown_items" ADD CONSTRAINT "settlement_breakdown_items_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("settlement_id") ON DELETE CASCADE ON UPDATE CASCADE;
