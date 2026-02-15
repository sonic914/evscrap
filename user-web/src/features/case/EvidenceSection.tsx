import { useState, useRef, useEffect, useCallback, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadEvidence, UploadStage } from './evidenceUpload';
import { getUserApi, handle401 } from '../../lib/api';
import { formatFileSize } from '../../lib/file';

interface EvidenceItem {
  evidence_id: string;
  file_name: string;
  mime_type?: string;
  size_bytes: number;
  s3_key?: string;
  uploaded_at?: string;
  created_at?: string;
  target_type?: string | null;
  target_id?: string | null;
}

interface Props {
  caseId: string;
}

type ListMode = 'loading' | 'server' | 'fallback' | 'error';

/** 다운로드 상태(row별) */
type DownloadState = 'idle' | 'loading' | 'error';

const STAGE_LABELS: Record<UploadStage, string> = {
  idle: '',
  hashing: '🔑 SHA-256 계산 중…',
  preparing: '📋 Presign 요청 중…',
  uploading: '⬆️ S3 업로드 중…',
  registering: '📝 서버 등록 중…',
  done: '✅ 업로드 완료',
  failed: '❌ 업로드 실패',
};

export default function EvidenceSection({ caseId }: Props) {
  const navigate = useNavigate();
  const [evidences, setEvidences] = useState<EvidenceItem[]>([]);
  const [listMode, setListMode] = useState<ListMode>('loading');
  const [listError, setListError] = useState('');
  const [stage, setStage] = useState<UploadStage>('idle');
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});
  const [downloadError, setDownloadError] = useState('');

  // 서버 목록 조회
  const fetchEvidences = useCallback(async () => {
    try {
      const api = getUserApi();
      const { data, error: apiErr, response } = await api.GET(
        '/user/v1/{targetType}/{targetId}/evidence',
        { params: { path: { targetType: 'CASE', targetId: caseId } } }
      );

      if (handle401(response?.status, navigate)) return;

      // 404/501 → 폴백 모드
      if (response?.status === 404 || response?.status === 501) {
        setListMode('fallback');
        return;
      }

      if (apiErr || !data) {
        setListMode('error');
        setListError('목록 조회 실패');
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      const items: EvidenceItem[] = (d.items || []).map((e: any) => ({
        evidence_id: e.evidence_id || e.id,
        file_name: e.s3_key?.split('/').pop() || '(알 수 없음)',
        mime_type: e.mime_type,
        size_bytes: e.size_bytes,
        s3_key: e.s3_key,
        uploaded_at: e.uploaded_at,
        created_at: e.created_at,
        target_type: e.target_type,
        target_id: e.target_id,
      }));

      setEvidences(items);
      setListMode('server');
    } catch {
      setListMode('error');
      setListError('네트워크 오류');
    }
  }, [caseId, navigate]);

  useEffect(() => {
    fetchEvidences();
  }, [fetchEvidences]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile || uploadingRef.current) return;
    uploadingRef.current = true;
    setError('');
    setStage('idle');

    const result = await uploadEvidence(selectedFile, {
      onStageChange: setStage,
      onNavigate: navigate,
      targetType: 'CASE',
      targetId: caseId,
    });

    if (result.stage === 'done') {
      if (listMode === 'server') {
        // 서버 모드 → refetch
        await fetchEvidences();
      } else {
        // 폴백 모드 → 로컬 append
        setEvidences((prev) => [
          ...prev,
          {
            evidence_id: result.evidenceId || 'unknown',
            file_name: selectedFile.name,
            size_bytes: selectedFile.size,
            s3_key: result.s3Key,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else if (result.stage === 'failed') {
      setError(result.error || '알 수 없는 오류');
    }

    uploadingRef.current = false;
  }

  async function handleRetry() {
    if (!selectedFile) return;
    setError('');
    setStage('idle');
    uploadingRef.current = true;

    const result = await uploadEvidence(selectedFile, {
      onStageChange: setStage,
      onNavigate: navigate,
      targetType: 'CASE',
      targetId: caseId,
    });

    if (result.stage === 'done') {
      if (listMode === 'server') {
        await fetchEvidences();
      } else {
        setEvidences((prev) => [
          ...prev,
          {
            evidence_id: result.evidenceId || 'unknown',
            file_name: selectedFile.name,
            size_bytes: selectedFile.size,
            s3_key: result.s3Key,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('');
    } else if (result.stage === 'failed') {
      setError(result.error || '재시도 실패');
    }

    uploadingRef.current = false;
  }

  async function handleDownload(evidenceId: string) {
    setDownloadError('');
    setDownloadStates((prev) => ({ ...prev, [evidenceId]: 'loading' }));
    try {
      const api = getUserApi();
      const { data, error: apiErr, response } = await api.GET(
        '/user/v1/evidence/{evidenceId}/download-url',
        { params: { path: { evidenceId } } },
      );
      if (handle401(response?.status, navigate)) return;
      if (response?.status === 404) {
        setDownloadError('파일을 찾을 수 없습니다 (권한/삭제/만료)');
        setDownloadStates((prev) => ({ ...prev, [evidenceId]: 'error' }));
        return;
      }
      if (apiErr || !data) {
        setDownloadError('다운로드 URL 생성 실패, 다시 시도해 주세요');
        setDownloadStates((prev) => ({ ...prev, [evidenceId]: 'error' }));
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      // ⚠️ download_url은 절대 console.log 하지 않는다
      if (d.download_url) {
        window.open(d.download_url, '_blank', 'noopener,noreferrer');
      }
      setDownloadStates((prev) => ({ ...prev, [evidenceId]: 'idle' }));
    } catch {
      setDownloadError('네트워크 오류');
      setDownloadStates((prev) => ({ ...prev, [evidenceId]: 'error' }));
    }
  }

  const isUploading = stage !== 'idle' && stage !== 'done' && stage !== 'failed';

  return (
    <section>
      <h2>📎 증빙(Evidence)</h2>

      {/* 모드별 배너 */}
      {listMode === 'fallback' && (
        <div style={{ padding: 8, background: '#fff3cd', borderRadius: 4, marginBottom: 12, fontSize: 12, color: '#856404' }}>
          ⚠️ 서버 목록 미지원(폴백 모드) — 이 세션에서 업로드한 증빙만 표시됩니다.
        </div>
      )}
      {listMode === 'server' && (
        <div style={{ padding: 8, background: '#d4edda', borderRadius: 4, marginBottom: 12, fontSize: 12, color: '#155724' }}>
          ✅ 이 케이스에 연결된 증빙 목록입니다.
        </div>
      )}

      {/* 로딩 */}
      {listMode === 'loading' && (
        <p style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>📡 증빙 목록 조회 중…</p>
      )}

      {/* 에러 + 재시도 */}
      {listMode === 'error' && (
        <div style={{ padding: 8, background: '#fdd', borderRadius: 4, marginBottom: 12 }}>
          <span style={{ fontSize: 13 }}>❌ {listError}</span>
          <button onClick={fetchEvidences} style={{ marginLeft: 8, padding: '2px 8px', fontSize: 12 }}>🔄 다시 시도</button>
        </div>
      )}

      {/* 목록 테이블 */}
      {listMode !== 'loading' && evidences.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>파일명</th>
              <th style={{ padding: 6 }}>크기</th>
              <th style={{ padding: 6 }}>Evidence ID</th>
              <th style={{ padding: 6 }}>시각</th>
              <th style={{ padding: 6 }}></th>
            </tr>
          </thead>
          <tbody>
            {evidences.map((ev) => {
              const dlState = downloadStates[ev.evidence_id] || 'idle';
              return (
                <tr key={ev.evidence_id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 6, fontSize: 13 }}>{ev.file_name}</td>
                  <td style={{ padding: 6, fontSize: 13 }}>{formatFileSize(ev.size_bytes)}</td>
                  <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>{ev.evidence_id.slice(0, 8)}…</td>
                  <td style={{ padding: 6, fontSize: 12 }}>
                    {new Date(ev.uploaded_at || ev.created_at || '').toLocaleString('ko')}
                  </td>
                  <td style={{ padding: 6 }}>
                    <button
                      onClick={() => handleDownload(ev.evidence_id)}
                      disabled={dlState === 'loading'}
                      style={{ padding: '2px 10px', fontSize: 12, cursor: dlState === 'loading' ? 'wait' : 'pointer' }}
                      title="파일 다운로드"
                    >
                      {dlState === 'loading' ? '⏳' : '⬇️'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {listMode !== 'loading' && evidences.length === 0 && (
        <p style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>
          등록된 증빙이 없습니다.
        </p>
      )}

      {/* 다운로드 에러 */}
      {downloadError && (
        <div style={{ padding: 8, background: '#fdd', borderRadius: 4, marginBottom: 8, fontSize: 13 }}>
          ⬇️ {downloadError}
        </div>
      )}

      {/* 업로드 폼 */}
      <form onSubmit={handleSubmit} style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 13 }}>파일 선택 (최대 100MB)</label><br />
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              disabled={isUploading}
              style={{ padding: 4 }}
            />
          </div>
          <button type="submit" disabled={!selectedFile || isUploading} style={{ padding: '6px 16px' }}>
            {isUploading ? '업로드 중…' : '📤 업로드'}
          </button>
        </div>

        {stage !== 'idle' && (
          <div style={{ marginTop: 8, padding: 8, background: stage === 'done' ? '#d4edda' : stage === 'failed' ? '#fdd' : '#fff3cd', borderRadius: 4, fontSize: 13 }}>
            {STAGE_LABELS[stage]}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 8 }}>
            <div style={{ padding: 8, background: '#fdd', borderRadius: 4, fontSize: 13, marginBottom: 4 }}>{error}</div>
            {selectedFile && !isUploading && (
              <button type="button" onClick={handleRetry} style={{ padding: '4px 12px', fontSize: 12 }}>🔄 재시도 (presign부터)</button>
            )}
          </div>
        )}

        {selectedFile && (
          <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
            선택: {selectedFile.name} ({formatFileSize(selectedFile.size)})
          </div>
        )}
      </form>
    </section>
  );
}
