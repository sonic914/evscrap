/**
 * Anchor Worker 타입 정의
 */

/**
 * 앵커 프로바이더 인터페이스
 * 블록체인(또는 Mock)에 해시를 앵커링하는 역할
 */
export interface IAnchorProvider {
  /**
   * 주어진 해시를 블록체인에 앵커링
   * @param hash - canonical_hash (이벤트 데이터의 해시)
   * @returns AnchorResult - 성공 여부 및 txid
   */
  anchor(hash: string): Promise<AnchorResult>;
}

/**
 * 앵커링 결과
 */
export interface AnchorResult {
  /** 앵커링 성공 여부 */
  success: boolean;
  
  /** 트랜잭션 ID (성공 시) */
  txid?: string;
  
  /** 에러 메시지 (실패 시) */
  error?: string;
}

/**
 * Worker가 처리할 이벤트 데이터
 */
export interface WorkerEvent {
  /** 이벤트 ID */
  eventId: string;
  
  /** Canonical Hash (선택 - DB에서 조회 가능) */
  canonicalHash?: string;
}
