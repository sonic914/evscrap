import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { isLoggedIn } from '../lib/auth';

const API = import.meta.env.VITE_API_BASE || '';
const REASON_CODES = [
  { value: 'AMOUNT_ERROR', label: '금액 오류' },
  { value: 'MISSING_ITEM', label: '누락 항목' },
  { value: 'GRADE_DISPUTE', label: '등급 이의' },
  { value: 'OTHER', label: '기타' },
];

export default function DisputeCreatePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const settlementId = params.get('settlementId') || '';
  const targetType = params.get('targetType') || '';
  const targetId = params.get('targetId') || '';

  const [reasonCode, setReasonCode] = useState('AMOUNT_ERROR');
  const [description, setDescription] = useState('');
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [selectedEvIds, setSelectedEvIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!isLoggedIn()) navigate('/login'); }, [navigate]);

  // 증빙 목록 로드
  useEffect(() => {
    if (!targetType || !targetId) return;
    const token = localStorage.getItem('id_token') || '';
    fetch(`${API}/user/v1/${targetType}/${targetId}/evidence`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(d => setEvidenceList(d.items || [])).catch(() => {});
  }, [targetType, targetId]);

  const handleSubmit = async () => {
    if (!description.trim()) { setError('설명을 입력하세요'); return; }
    setSubmitting(true); setError('');
    try {
      const token = localStorage.getItem('id_token') || '';
      const res = await fetch(`${API}/user/v1/settlements/${settlementId}/disputes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          reason_code: reasonCode,
          description: description.trim(),
          ...(selectedEvIds.length > 0 && { evidence_ids: selectedEvIds }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        navigate(`/disputes/${body.dispute_id || body.id}`);
      } else {
        setError(body.message || `오류 (${res.status})`);
      }
    } catch (err: any) {
      setError(err.message || '네트워크 오류');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEvidence = (id: string) => {
    setSelectedEvIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <Link to={`/settlements/${targetType}/${targetId}`}>← 정산 상세</Link>
      <h1>📝 이의제기 생성</h1>
      <p style={{ fontSize: 12, color: '#888' }}>정산 ID: {settlementId.slice(0, 8)}…</p>

      {error && <div style={{ padding: 12, background: '#fdd', borderRadius: 4, marginBottom: 16 }}>{error}</div>}

      <div style={{ marginBottom: 16 }}>
        <label><strong>사유 코드</strong></label>
        <select value={reasonCode} onChange={e => setReasonCode(e.target.value)} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}>
          {REASON_CODES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label><strong>설명</strong> (최대 2000자)</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000}
          style={{ display: 'block', width: '100%', minHeight: 120, padding: 8, marginTop: 4 }} placeholder="이의제기 사유를 상세히 기재해 주세요" />
        <span style={{ fontSize: 11, color: '#888' }}>{description.length}/2000</span>
      </div>

      {evidenceList.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label><strong>참조 증빙 (선택)</strong></label>
          <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #ddd', borderRadius: 4, marginTop: 4 }}>
            {evidenceList.map((ev: any) => (
              <label key={ev.evidence_id || ev.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid #eee', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedEvIds.includes(ev.evidence_id || ev.id)}
                  onChange={() => toggleEvidence(ev.evidence_id || ev.id)} style={{ marginRight: 8 }} />
                <span style={{ fontSize: 13 }}>{ev.s3_key?.split('/').pop() || ev.evidence_id || ev.id}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>{ev.mime_type}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <button onClick={handleSubmit} disabled={submitting}
        style={{ padding: '10px 32px', fontSize: 16, fontWeight: 'bold', background: submitting ? '#999' : '#dc3545', color: '#fff', border: 'none', borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer' }}>
        {submitting ? '제출 중...' : '🚨 이의제기 제출'}
      </button>
    </div>
  );
}
