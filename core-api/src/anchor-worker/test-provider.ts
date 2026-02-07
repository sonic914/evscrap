/**
 * MockAnchorProvider 로컬 테스트 스크립트
 * 실행: ts-node src/anchor-worker/test-provider.ts
 */

import { MockAnchorProvider } from './mock-provider';

async function testMockProvider() {
  console.log('=== MockAnchorProvider 로컬 테스트 ===\n');

  const provider = new MockAnchorProvider(0.95, 100, 500); // 빠른 테스트를 위해 지연 시간 단축
  const testHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  console.log('5회 테스트 시작...\n');

  for (let i = 1; i <= 5; i++) {
    console.log(`--- Test ${i}/5 ---`);
    const startTime = Date.now();
    
    try {
      const result = await provider.anchor(testHash);
      const elapsed = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ 성공: ${result.txid} (${elapsed}ms)\n`);
      } else {
        console.log(`❌ 실패: ${result.error} (${elapsed}ms)\n`);
      }
    } catch (error) {
      console.error(`❌ 예외 발생:`, error);
    }
  }

  console.log('=== 테스트 완료 ===');
}

// 스크립트 실행
testMockProvider().catch(console.error);
