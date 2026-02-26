-- P2-4.2: SettlementAck에 anchor_event_id 추가
ALTER TABLE "settlement_acks" ADD COLUMN "anchor_event_id" TEXT UNIQUE;
