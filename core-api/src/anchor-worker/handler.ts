/**
 * Anchor Worker 비즈니스 로직
 * Event를 조회하고 앵커링 후 DB를 업데이트
 */

import { getPrismaClient } from './prisma-lambda';
import { MockAnchorProvider } from './mock-provider';

/**
 * 이벤트 앵커링 처리
 * @param eventId - 앵커링할 이벤트 ID
 */
export async function processEvent(eventId: string): Promise<void> {
  const prisma = await getPrismaClient();
  const provider = new MockAnchorProvider();

  try {
    console.log(`[ProcessEvent] Starting: ${eventId}`);

    // 1. Event 조회
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        canonicalHash: true,
        anchorStatus: true,
      },
    });

    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    console.log(`[ProcessEvent] Event found: ${eventId}, status: ${event.anchorStatus}`);

    // 2. 이미 처리된 이벤트는 스킵 (멱등성)
    if (event.anchorStatus === 'VERIFIED') {
      console.log(`[ProcessEvent] Event ${eventId} already VERIFIED, skipping`);
      return;
    }

    if (event.anchorStatus !== 'PENDING') {
      console.warn(`[ProcessEvent] Event ${eventId} has unexpected status: ${event.anchorStatus}`);
      // FAILED 상태는 재시도 가능하도록 계속 진행
    }

    // 3. 앵커링 시도
    console.log(`[ProcessEvent] Anchoring hash: ${event.canonicalHash.substring(0, 16)}...`);
    const result = await provider.anchor(event.canonicalHash);

    // 4. DB 업데이트 (트랜잭션)
    if (result.success && result.txid) {
      console.log(`[ProcessEvent] Anchoring succeeded, txid: ${result.txid}`);
      
      await prisma.$transaction([
        // Event 업데이트
        prisma.event.update({
          where: { id: eventId },
          data: {
            anchorStatus: 'VERIFIED',
            anchorTxid: result.txid,
          },
        }),
        // BlockchainAnchor 레코드 생성
        prisma.blockchainAnchor.create({
          data: {
            eventId: eventId,
            txid: result.txid,
            status: 'VERIFIED',
            verifiedAt: new Date(),
          },
        }),
      ]);

      console.log(`[ProcessEvent] Successfully processed event ${eventId}`);
    } else {
      // 5. 앵커링 실패
      console.error(`[ProcessEvent] Anchoring failed: ${result.error}`);
      
      await prisma.event.update({
        where: { id: eventId },
        data: {
          anchorStatus: 'FAILED',
        },
      });

      throw new Error(`Anchoring failed: ${result.error}`);
    }
  } catch (error) {
    console.error(`[ProcessEvent] Error processing event ${eventId}:`, error);
    
    // 예외 발생 시 FAILED 상태로 업데이트 (DB 접근 가능한 경우)
    try {
      await prisma.event.update({
        where: { id: eventId },
        data: {
          anchorStatus: 'FAILED',
        },
      });
    } catch (updateError) {
      console.error(`[ProcessEvent] Failed to update event status to FAILED:`, updateError);
    }
    
    // 에러를 다시 던져서 SQS가 재시도하도록 함
    throw error;
  }
}
