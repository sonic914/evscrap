/**
 * Evidence 업로드 순수 로직
 *
 * 3-step: presign → S3 PUT → registerEvidence
 * 보안: presigned URL/s3Key 전체 로그 금지
 */
import { getUserApi, makeIdempotencyKey, handle401 } from '../../lib/api';
import { computeSha256, maskSensitive } from '../../lib/file';

export type UploadStage = 'idle' | 'preparing' | 'hashing' | 'uploading' | 'registering' | 'done' | 'failed';

export interface UploadResult {
  stage: UploadStage;
  evidenceId?: string;
  s3Key?: string;
  error?: string;
}

interface UploadCallbacks {
  onStageChange: (stage: UploadStage) => void;
  onNavigate: (path: string) => void;
  /** target 연결 (선택) */
  targetType?: string;
  targetId?: string;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function uploadEvidence(
  file: File,
  callbacks: UploadCallbacks,
): Promise<UploadResult> {
  const { onStageChange, onNavigate, targetType, targetId } = callbacks;

  // 파일 크기 제한
  if (file.size > MAX_FILE_SIZE) {
    return { stage: 'failed', error: `파일 크기가 100MB를 초과합니다 (${(file.size / 1024 / 1024).toFixed(1)}MB)` };
  }

  // Step 0: SHA-256 해시
  onStageChange('hashing');
  let sha256: string;
  try {
    sha256 = await computeSha256(file);
  } catch {
    return { stage: 'failed', error: 'SHA-256 계산 실패' };
  }

  // Step 1: Presign
  onStageChange('preparing');
  const api = getUserApi();
  let presignedUrl: string;
  let evidenceId: string;
  let s3Key: string;

  try {
    const presignBody: Record<string, unknown> = {
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
    };
    if (targetType && targetId) {
      presignBody.target_type = targetType;
      presignBody.target_id = targetId;
    }

    const { data, error: apiErr, response } = await api.POST('/user/v1/evidence/presign', {
      body: presignBody as never,
    });

    if (handle401(response?.status, onNavigate)) {
      return { stage: 'failed', error: '인증 만료' };
    }

    if (apiErr || !data) {
      return { stage: 'failed', error: `Presign 실패: ${JSON.stringify(apiErr)}` };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    presignedUrl = d.presigned_url;
    evidenceId = d.evidence_id;
    s3Key = d.s3_key || '';

    if (!presignedUrl || !evidenceId) {
      return { stage: 'failed', error: 'Presign 응답에 URL 또는 ID 누락' };
    }

    console.log(`[evidence] presign OK, evidenceId=${evidenceId}, s3Key=${maskSensitive(s3Key)}`);
  } catch (err) {
    return { stage: 'failed', error: `Presign 오류: ${err instanceof Error ? err.message : '네트워크'}` };
  }

  // Step 2: S3 PUT (XHR for progress, fallback to fetch)
  onStageChange('uploading');
  try {
    const putResult = await s3Put(presignedUrl, file);
    if (!putResult.ok) {
      // 재시도 1회: presign은 유효할 수 있으므로 같은 URL로
      console.log('[evidence] S3 PUT 1차 실패, 재시도');
      const retry = await s3Put(presignedUrl, file);
      if (!retry.ok) {
        return { stage: 'failed', error: `S3 업로드 실패 (${retry.status})`, evidenceId, s3Key };
      }
    }
    console.log('[evidence] S3 PUT 완료');
  } catch (err) {
    return { stage: 'failed', error: `S3 업로드 오류: ${err instanceof Error ? err.message : '네트워크'}`, evidenceId, s3Key };
  }

  // Step 3: Register
  onStageChange('registering');
  try {
    const idempotencyKey = makeIdempotencyKey();
    const registerBody: Record<string, unknown> = {
      evidence_id: evidenceId,
      sha256,
      size_bytes: file.size,
      s3_key: s3Key,
      mime_type: file.type || 'application/octet-stream',
    };
    if (targetType && targetId) {
      registerBody.target_type = targetType;
      registerBody.target_id = targetId;
    }

    const { data: regData, error: regErr, response: regRes } = await api.POST('/user/v1/evidence', {
      body: registerBody as never,
      headers: { 'Idempotency-Key': idempotencyKey } as never,
    });

    if (handle401(regRes?.status, onNavigate)) {
      return { stage: 'failed', error: '인증 만료' };
    }

    if (regRes?.status === 409) {
      // 이미 등록됨 — 성공으로 간주
      console.log('[evidence] register 409 — 이미 등록됨');
      onStageChange('done');
      return { stage: 'done', evidenceId, s3Key };
    }

    if (regErr || !regData) {
      return { stage: 'failed', error: `등록 실패: ${JSON.stringify(regErr)}`, evidenceId, s3Key };
    }

    console.log(`[evidence] register OK, evidenceId=${evidenceId}`);
    onStageChange('done');
    return { stage: 'done', evidenceId, s3Key };
  } catch (err) {
    return { stage: 'failed', error: `등록 오류: ${err instanceof Error ? err.message : '네트워크'}`, evidenceId, s3Key };
  }
}

/** S3 PUT with fetch */
async function s3Put(url: string, file: File): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  return { ok: res.ok, status: res.status };
}
