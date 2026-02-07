/**
 * 간단한 핸들러 테스트 스크립트
 * 실행: ts-node src/anchor-worker/test-handler.ts
 * 
 * 주의: 실제 DB 연결이 필요하므로 DATABASE_URL 환경변수 필요
 */

import { processEvent } from './handler';

async function testHandler() {
  console.log('=== Handler 로컬 테스트 ===\n');

  // 환경변수 확인
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL 환경변수가 설정되지 않았습니다.');
    console.log('테스트를 위해 .env 파일을 생성하거나 환경변수를 설정해주세요.\n');
    console.log('예시 .env 파일:');
    console.log('DATABASE_URL="postgresql://user:password@localhost:5432/evscrap"\n');
    process.exit(1);
  }

  // 실제 이벤트 ID로 교체 필요
  const testEventId = 'YOUR_EVENT_ID_HERE';

  console.log(`테스트 이벤트 ID: ${testEventId}`);
  console.log('처리 시작...\n');

  try {
    await processEvent(testEventId);
    console.log('\n✅ 테스트 성공!');
  } catch (error) {
    console.error('\n❌ 테스트 실패:', error);
    process.exit(1);
  }
}

// 스크립트 실행
testHandler().catch(console.error);
