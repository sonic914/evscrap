/**
 * Anchor Worker 비즈니스 로직
 * Event를 조회하고 앵커링 후 DB를 업데이트
 */

import { getPrismaClient } from './prisma-lambda';
import { MockAnchorProvider } from './mock-provider';
import logger from '../utils/logger';

/**
 * 이벤트 앵커링 처리
 * @param eventId - 앵커링할 이벤트 ID
 * @param messageId - SQS 메시지 ID (추적용)
 */
export async function processEvent(eventId: string, messageId?: string): Promise<void> {
  const prisma = await getPrismaClient();
  const provider = new MockAnchorProvider();
  const ctx = { event_id: eventId, sqs_message_id: messageId };

  try {
    logger.info('ANCHOR_PROCESS_START', ctx);

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
      logger.error('ANCHOR_EVENT_NOT_FOUND', ctx);
      throw new Error(`Event ${eventId} not found`);
    }

    logger.info('ANCHOR_EVENT_FOUND', { ...ctx, anchor_status: event.anchorStatus });

    // 2. 이미 처리된 이벤트는 스킵 (멱등성)
    if (event.anchorStatus === 'VERIFIED') {
      logger.info('ANCHOR_SKIP_ALREADY_VERIFIED', ctx);
      return;
    }

    if (event.anchorStatus !== 'PENDING') {
      logger.warn('ANCHOR_UNEXPECTED_STATUS', { ...ctx, anchor_status: event.anchorStatus });
    }

    // 3. 앵커링 시도
    logger.info('ANCHOR_SUBMITTING', { ...ctx, hash_prefix: event.canonicalHash.substring(0, 16) });
    const result = await provider.anchor(event.canonicalHash);

    // 4. DB 업데이트 (트랜잭션)
    if (result.success && result.txid) {
      await prisma.$transaction([
        prisma.event.update({
          where: { id: eventId },
          data: {
            anchorStatus: 'VERIFIED',
            anchorTxid: result.txid,
          },
        }),
        prisma.blockchainAnchor.create({
          data: {
            eventId: eventId,
            txid: result.txid,
            status: 'VERIFIED',
            verifiedAt: new Date(),
          },
        }),
      ]);

      logger.info('ANCHOR_SUCCESS', { ...ctx, txid: result.txid });
      logger.metric('anchor_worker_success');
    } else {
      // 5. 앵커링 실패
      logger.error('ANCHOR_FAILED', { ...ctx, error: result.error });
      logger.metric('anchor_worker_error');
      
      await prisma.event.update({
        where: { id: eventId },
        data: { anchorStatus: 'FAILED' },
      });

      throw new Error(`Anchoring failed: ${result.error}`);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('ANCHOR_PROCESS_ERROR', { ...ctx, error: errMsg });
    
    // 예외 발생 시 FAILED 상태로 업데이트
    try {
      await prisma.event.update({
        where: { id: eventId },
        data: { anchorStatus: 'FAILED' },
      });
    } catch (updateError) {
      logger.error('ANCHOR_STATUS_UPDATE_FAILED', { ...ctx, error: String(updateError) });
    }
    
    throw error;
  }
}
