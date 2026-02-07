/**
 * Anchor Worker Lambda 핸들러
 * SQS Queue에서 이벤트를 받아 앵커링 처리
 */

import { SQSHandler, SQSRecord } from 'aws-lambda';
import { processEvent } from './handler';

/**
 * Lambda 핸들러 엔트리포인트
 * SQS 메시지를 받아 각 레코드를 처리
 */
export const handler: SQSHandler = async (event) => {
  console.log(`[AnchorWorker] Received ${event.Records.length} message(s)`);

  const results = [];

  for (const record of event.Records) {
    try {
      const body = parseMessageBody(record);
      console.log(`[AnchorWorker] Processing eventId: ${body.eventId}`);
      
      await processEvent(body.eventId);
      
      results.push({ eventId: body.eventId, status: 'success' });
    } catch (error) {
      console.error(`[AnchorWorker] Failed to process record:`, error);
      results.push({ 
        eventId: 'unknown', 
        status: 'failed', 
        error: error instanceof Error ? error.message : String(error)
      });
      
      // SQS에게 실패를 알림 (재시도 또는 DLQ로 이동)
      throw error;
    }
  }

  console.log(`[AnchorWorker] Batch processing complete:`, results);
};

/**
 * SQS 메시지 바디 파싱
 */
function parseMessageBody(record: SQSRecord): { eventId: string } {
  try {
    const body = JSON.parse(record.body);
    
    if (!body.eventId) {
      throw new Error('Missing eventId in message body');
    }
    
    return { eventId: body.eventId };
  } catch (error) {
    console.error(`[AnchorWorker] Failed to parse message body:`, record.body);
    throw new Error(`Invalid message format: ${error instanceof Error ? error.message : String(error)}`);
  }
}
