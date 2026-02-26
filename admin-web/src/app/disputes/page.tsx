'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { adminFetch } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  OPEN: '접수', UNDER_REVIEW: '검토중', NEEDS_INFO: '정보요청',
  RESOLVED_ACCEPTED: '인정', RESOLVED_REJECTED: '기각',
};
const STATUS_COLORS: Record<string, string> = {
  OPEN: '#fd7e14', UNDER_REVIEW: '#007bff', NEEDS_INFO: '#ffc107',
  RESOLVED_ACCEPTED: '#28a745', RESOLVED_REJECTED: '#dc3545',
};
const STATUS_OPTIONS = ['', 'OPEN', 'UNDER_REVIEW', 'NEEDS_INFO', 'RESOLVED_ACCEPTED', 'RESOLVED_REJECTED'];

export default function DisputeListPage() {
  useAuthGuard();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    params.set('limit', '100');
    adminFetch(`/admin/v1/disputes?${params}`)
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setTotal(d.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div style={{ padding: 24 }}>
      <h1>🚨 이의제기 관리</h1>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>상태:</label>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setLoading(true); }}
          style={{ padding: '4px 8px' }}>
          <option value="">전체</option>
          {STATUS_OPTIONS.filter(Boolean).map(s => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#888' }}>총 {total}건</span>
      </div>
      {loading ? <p>로딩 중...</p> : items.length === 0 ? <p style={{ color: '#888' }}>이의제기가 없습니다.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
            <th style={{ padding: 8 }}>상태</th><th style={{ padding: 8 }}>사유</th>
            <th style={{ padding: 8 }}>설명</th><th style={{ padding: 8 }}>테넌트</th>
            <th style={{ padding: 8 }}>생성일</th>
          </tr></thead>
          <tbody>{items.map((d: any) => (
            <tr key={d.dispute_id || d.id} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
              onClick={() => router.push(`/disputes/${d.dispute_id || d.id}`)}>
              <td style={{ padding: 8 }}>
                <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, color: '#fff', background: STATUS_COLORS[d.status] || '#999' }}>
                  {STATUS_LABELS[d.status] || d.status}
                </span>
              </td>
              <td style={{ padding: 8 }}>{d.reason_code}</td>
              <td style={{ padding: 8, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description}</td>
              <td style={{ padding: 8, fontSize: 11, fontFamily: 'monospace' }}>{d.tenant_id?.slice(0, 8)}…</td>
              <td style={{ padding: 8, fontSize: 12 }}>{new Date(d.created_at).toLocaleDateString('ko')}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
