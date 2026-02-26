'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { adminFetch } from '@/lib/api';
import { useAuthGuard } from '@/lib/useAuthGuard';

const STATUS_LABELS: Record<string, string> = {
  OPEN: '접수', UNDER_REVIEW: '검토중', NEEDS_INFO: '정보요청',
  RESOLVED_ACCEPTED: '인정', RESOLVED_REJECTED: '기각',
};
const STATUS_COLORS: Record<string, string> = {
  OPEN: '#fd7e14', UNDER_REVIEW: '#007bff', NEEDS_INFO: '#ffc107',
  RESOLVED_ACCEPTED: '#28a745', RESOLVED_REJECTED: '#dc3545',
};

const TRANSITIONS: Record<string, { label: string; next: string; color: string }[]> = {
  OPEN: [
    { label: '검토 시작', next: 'UNDER_REVIEW', color: '#007bff' },
    { label: '기각', next: 'RESOLVED_REJECTED', color: '#dc3545' },
  ],
  UNDER_REVIEW: [
    { label: '인정', next: 'RESOLVED_ACCEPTED', color: '#28a745' },
    { label: '기각', next: 'RESOLVED_REJECTED', color: '#dc3545' },
    { label: '정보 요청', next: 'NEEDS_INFO', color: '#ffc107' },
  ],
  NEEDS_INFO: [
    { label: '검토 복귀', next: 'UNDER_REVIEW', color: '#007bff' },
  ],
};

export default function DisputeDetailAdmin() {
  useAuthGuard();
  const pathname = usePathname();
  const disputeId = pathname.split('/').pop() || '';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [transiting, setTransiting] = useState('');

  const fetchData = useCallback(() => {
    setLoading(true);
    adminFetch(`/admin/v1/disputes/${disputeId}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(d => { setData(d); setError(''); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [disputeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTransition = async (nextStatus: string) => {
    if (transiting) return;
    setTransiting(nextStatus);
    setError('');
    try {
      const res = await adminFetch(`/admin/v1/disputes/${disputeId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          next_status: nextStatus,
          current_status: data?.status,
          ...(adminNote.trim() && { admin_note: adminNote.trim() }),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message || `전이 실패 (${res.status})`);
      } else {
        const updated = await res.json();
        setData(updated);
        setAdminNote('');
      }
    } catch (err: any) {
      setError(err.message || '네트워크 오류');
    } finally {
      setTransiting('');
    }
  };

  if (loading) return <div style={{ padding: 24 }}>로딩 중...</div>;
  if (error && !data) return <div style={{ padding: 24, color: 'red' }}>오류: {error}</div>;
  if (!data) return null;

  const actions = TRANSITIONS[data.status] || [];
  const evIds: string[] = data.evidence_ids || [];

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <h1>🚨 이의제기 상세 (Admin)</h1>

      {error && <div style={{ padding: 12, background: '#fdd', borderRadius: 4, marginBottom: 16 }}>{error}</div>}

      <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontWeight: 'bold', fontSize: 16 }}>상태</span>
          <span style={{ padding: '4px 16px', borderRadius: 16, color: '#fff', fontSize: 14, background: STATUS_COLORS[data.status] || '#999' }}>
            {STATUS_LABELS[data.status] || data.status}
          </span>
        </div>
        <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#888', marginBottom: 12 }}>ID: {data.dispute_id || data.id}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div><strong>사유:</strong> {data.reason_code}</div>
          <div><strong>정산:</strong> <code style={{ fontSize: 11 }}>{data.settlement_id?.slice(0, 8)}…</code></div>
          <div><strong>테넌트:</strong> <code style={{ fontSize: 11 }}>{data.tenant_id?.slice(0, 8)}…</code></div>
          <div><strong>생성:</strong> {new Date(data.created_at).toLocaleString('ko')}</div>
        </div>
        <div style={{ marginBottom: 8 }}><strong>설명:</strong></div>
        <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 4, whiteSpace: 'pre-wrap', fontSize: 14, marginBottom: 12 }}>{data.description}</div>
        {data.admin_note && (
          <div style={{ padding: 12, background: '#e8f4fd', borderRadius: 4, marginBottom: 12 }}>
            <strong>관리자 메모:</strong> {data.admin_note}
          </div>
        )}
        {evIds.length > 0 && (
          <div style={{ padding: 8, background: '#f9f9f9', borderRadius: 4 }}>
            <strong>증빙 ({evIds.length}건):</strong>
            {evIds.map(eid => <div key={eid} style={{ fontSize: 11, fontFamily: 'monospace' }}>{eid}</div>)}
          </div>
        )}
      </div>

      {/* 전이 UI */}
      {actions.length > 0 && (
        <div style={{ padding: 16, border: '2px solid #007bff', borderRadius: 8, background: '#f0f7ff' }}>
          <h3 style={{ marginTop: 0 }}>상태 전이</h3>
          <div style={{ marginBottom: 12 }}>
            <label><strong>관리자 메모 (선택)</strong></label>
            <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)}
              style={{ display: 'block', width: '100%', minHeight: 60, padding: 8, marginTop: 4 }}
              placeholder="전이 사유 또는 메모" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {actions.map(a => (
              <button key={a.next} onClick={() => handleTransition(a.next)}
                disabled={!!transiting}
                style={{
                  padding: '8px 20px', fontSize: 14, fontWeight: 'bold',
                  background: transiting === a.next ? '#999' : a.color,
                  color: a.color === '#ffc107' ? '#333' : '#fff',
                  border: 'none', borderRadius: 8,
                  cursor: transiting ? 'not-allowed' : 'pointer',
                }}>
                {transiting === a.next ? '처리중...' : a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!actions.length && (data.status?.startsWith('RESOLVED')) && (
        <div style={{ padding: 12, background: '#d4edda', borderRadius: 8, textAlign: 'center' }}>
          ✅ 이의제기가 종결되었습니다: {STATUS_LABELS[data.status] || data.status}
        </div>
      )}
    </div>
  );
}
