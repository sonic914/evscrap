import { IAnchorProvider, AnchorResult } from './types';

/**
 * Mock 블록체인 앵커 프로바이더
 * 실제 블록체인 대신 Mock txid를 생성하여 테스트/개발 환경에서 사용
 */
export class MockAnchorProvider implements IAnchorProvider {
  private readonly successRate: number;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;

  /**
   * @param successRate - 성공률 (0.0 ~ 1.0), 기본값 0.95 (95%)
   * @param minDelayMs - 최소 지연 시간 (ms), 기본값 1000ms
   * @param maxDelayMs - 최대 지연 시간 (ms), 기본값 3000ms
   */
  constructor(
    successRate: number = 0.95,
    minDelayMs: number = 1000,
    maxDelayMs: number = 3000
  ) {
    this.successRate = successRate;
    this.minDelayMs = minDelayMs;
    this.maxDelayMs = maxDelayMs;
  }

  /**
   * 주어진 해시를 Mock 블록체인에 앵커링
   * - 1-3초 랜덤 지연 시뮬레이션
   * - 95% 성공률로 Mock txid 생성
   * - 5% 확률로 실패 시뮬레이션
   */
  async anchor(hash: string): Promise<AnchorResult> {
    console.log(`[MockAnchorProvider] Anchoring hash: ${hash.substring(0, 16)}...`);

    // 지연 시뮬레이션 (실제 블록체인 네트워크 지연 흉내)
    const delay = this.minDelayMs + Math.random() * (this.maxDelayMs - this.minDelayMs);
    await this.sleep(delay);

    // 성공/실패 시뮬레이션
    const isSuccess = Math.random() < this.successRate;

    if (isSuccess) {
      const txid = this.generateMockTxid();
      console.log(`[MockAnchorProvider] Success! txid: ${txid}`);
      return {
        success: true,
        txid,
      };
    } else {
      const error = 'Mock anchoring failed (simulated network error)';
      console.error(`[MockAnchorProvider] Failed: ${error}`);
      return {
        success: false,
        error,
      };
    }
  }

  /**
   * Mock Transaction ID 생성
   * 형식: mock-tx-{timestamp}-{randomHex}
   * 예: mock-tx-1707210372845-a3f9c2e1
   */
  private generateMockTxid(): string {
    const timestamp = Date.now();
    const randomHex = this.randomHex(8);
    return `mock-tx-${timestamp}-${randomHex}`;
  }

  /**
   * 랜덤 16진수 문자열 생성
   * @param length - 문자열 길이
   */
  private randomHex(length: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  /**
   * 비동기 sleep 유틸리티
   * @param ms - 지연 시간 (밀리초)
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
