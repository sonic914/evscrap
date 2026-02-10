/**
 * Anchor Worker Lambda 핸들러
 * SQS Queue에서 이벤트를 받아 앵커링 처리
 */

import { SQSHandler, SQSRecord } from 'aws-lambda';
import { processEvent } from './handler';
import logger from '../utils/logger';

export const handler: SQSHandler = async (event) => {
  logger.info('WORKER_BATCH_START', { record_count: event.Records.length });

  for (const record of event.Records) {
    try {
      const body = parseMessageBody(record);
      
      await processEvent(body.eventId, record.messageId);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('WORKER_RECORD_FAILED', {
        sqs_message_id: record.messageId,
        error: errMsg,
      });
      
      // SQS에게 실패를 알림 (재시도 또는 DLQ로 이동)
      throw error;
    }
  }

  logger.info('WORKER_BATCH_COMPLETE', { record_count: event.Records.length });
};

function parseMessageBody(record: SQSRecord): { eventId: string } {
  try {
    const body = JSON.parse(record.body);
    
    if (!body.eventId) {
      throw new Error('Missing eventId in message body');
    }
    
    return { eventId: body.eventId };
  } catch (error) {
    logger.error('WORKER_PARSE_FAILED', {
      sqs_message_id: record.messageId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(`Invalid message format: ${error instanceof Error ? error.message : String(error)}`);
  }
};
