import { useState, useRef, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadEvidence, UploadStage } from './evidenceUpload';
import { formatFileSize } from '../../lib/file';

interface EvidenceItem {
  evidence_id: string;
  file_name: string;
  size_bytes: number;
  s3_key?: string;
  created_at: string;
}

interface Props {
  caseId: string;
}

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
  const [stage, setStage] = useState<UploadStage>('idle');
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile || uploadingRef.current) return;
    uploadingRef.current = true;
    setError('');
    setStage('idle');

    const result = await uploadEvidence(selectedFile, {
      onStageChange: setStage,
      onNavigate: navigate,
    });

    if (result.stage === 'done') {
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
    });

    if (result.stage === 'done') {
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
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('');
    } else if (result.stage === 'failed') {
      setError(result.error || '재시도 실패');
    }

    uploadingRef.current = false;
  }

  const isUploading = stage !== 'idle' && stage !== 'done' && stage !== 'failed';

  return (
    <section>
      <h2>📎 증빙(Evidence)</h2>

      <div style={{ padding: 8, background: '#e8f4fd', borderRadius: 4, marginBottom: 12, fontSize: 12, color: '#555' }}>
        ℹ️ 증빙은 tenant 단위로 저장됩니다 (케이스 직접 연결은 백엔드 보강 필요). Case ID: {caseId}
      </div>

      {/* 로컬 누적 리스트 */}
      {evidences.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>파일명</th>
              <th style={{ padding: 6 }}>크기</th>
              <th style={{ padding: 6 }}>Evidence ID</th>
              <th style={{ padding: 6 }}>시각</th>
            </tr>
          </thead>
          <tbody>
            {evidences.map((ev) => (
              <tr key={ev.evidence_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 6, fontSize: 13 }}>{ev.file_name}</td>
                <td style={{ padding: 6, fontSize: 13 }}>{formatFileSize(ev.size_bytes)}</td>
                <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>{ev.evidence_id.slice(0, 8)}…</td>
                <td style={{ padding: 6, fontSize: 12 }}>{new Date(ev.created_at).toLocaleTimeString('ko')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {evidences.length === 0 && (
        <p style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>
          이 세션에서 업로드한 증빙이 없습니다. (목록 API 미지원 → 로컬 누적)
        </p>
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

        {/* 단계 표시 */}
        {stage !== 'idle' && (
          <div style={{ marginTop: 8, padding: 8, background: stage === 'done' ? '#d4edda' : stage === 'failed' ? '#fdd' : '#fff3cd', borderRadius: 4, fontSize: 13 }}>
            {STAGE_LABELS[stage]}
          </div>
        )}

        {/* 에러 + 재시도 */}
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
