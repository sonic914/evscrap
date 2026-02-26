import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { isLoggedIn } from '../lib/auth';

const API = import.meta.env.VITE_API_BASE || '';
const STATUS_LABELS: Record<string, string> = {
  OPEN: '접수', UNDER_REVIEW: '검토중', NEEDS_INFO: '정보요청',
  RESOLVED_ACCEPTED: '인정', RESOLVED_REJECTED: '기각',
};
const STATUS_COLORS: Record<string, string> = {
  OPEN: '#fd7e14', UNDER_REVIEW: '#007bff', NEEDS_INFO: '#ffc107',
  RESOLVED_ACCEPTED: '#28a745', RESOLVED_REJECTED: '#dc3545',
};

export default function DisputeDetailPage() {
  const navigate = useNavigate();
  const { disputeId } = useParams<{ disputeId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { if (!isLoggedIn()) navigate('/login'); }, [navigate]);

  useEffect(() => {
    if (!disputeId) return;
    const token = localStorage.getItem('id_token') || '';
    fetch(`${API}/user/v1/disputes/${disputeId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [disputeId]);

  if (loading) return <div style={{ padding: 24 }}>로딩 중...</div>;
  if (error) return <div style={{ padding: 24 }}><Link to="/disputes">← 목록</Link><div style={{ padding: 12, background: '#fdd', borderRadius: 4, marginTop: 16 }}>오류: {error}</div></div>;
  if (!data) return null;

  const evIds: string[] = data.evidence_ids || [];

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
        <Link to="/disputes">← 이의제기 목록</Link>
        <Link to="/">홈</Link>
      </div>
      <h1>🚨 이의제기 상세</h1>

      <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontWeight: 'bold' }}>상태</span>
          <span style={{ padding: '4px 12px', borderRadius: 12, color: '#fff', fontSize: 13, background: STATUS_COLORS[data.status] || '#999' }}>
            {STATUS_LABELS[data.status] || data.status}
          </span>
        </div>
        <div style={{ fontSize: 12, fontFamily: 'monospace', marginBottom: 12, color: '#888' }}>ID: {data.dispute_id || data.id}</div>
        <div style={{ marginBottom: 8 }}><strong>사유:</strong> {data.reason_code}</div>
        <div style={{ marginBottom: 8 }}><strong>설명:</strong></div>
        <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 4, whiteSpace: 'pre-wrap', fontSize: 14, marginBottom: 12 }}>{data.description}</div>
        {data.admin_note && (
          <div style={{ padding: 12, background: '#e8f4fd', borderRadius: 4, marginBottom: 12 }}>
            <strong>관리자 메모:</strong> {data.admin_note}
          </div>
        )}
        <div style={{ fontSize: 12, color: '#888' }}>
          정산: <code>{data.settlement_id?.slice(0, 8)}…</code> | 생성: {new Date(data.created_at).toLocaleString('ko')}
        </div>
      </div>

      {evIds.length > 0 && (
        <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
          <strong>첨부 증빙 ({evIds.length}건)</strong>
          {evIds.map(eid => (
            <div key={eid} style={{ padding: 4, fontSize: 12, fontFamily: 'monospace' }}>{eid.slice(0, 12)}…</div>
          ))}
        </div>
      )}
    </div>
  );
}
