'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../NavBar';
import { useAuthGuard, handle401 } from '@/lib/useAuthGuard';
import { getAdminApi } from '@/lib/api';
import type { components } from '@evscrap/api-client';

type Settlement = components['schemas']['Settlement'];

function statusBadge(status: string) {
  const s = status.toLowerCase().replace('ready_for_approval', 'pending');
  return <span className={`badge badge-${s}`}>{status}</span>;
}

function formatAmount(n?: number) {
  if (n == null) return '-';
  return n.toLocaleString('ko-KR') + '원';
}

export default function SettlementsPage() {
  const router = useRouter();
  const authed = useAuthGuard();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    if (!authed) return;
    fetchSettlements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, statusFilter]);

  async function fetchSettlements() {
    setLoading(true);
    setError('');
    try {
      const api = getAdminApi();
      const params: { query?: { status?: components['schemas']['SettlementStatus'] } } = {};
      if (statusFilter) {
        params.query = { status: statusFilter as components['schemas']['SettlementStatus'] };
      }
      const { data, error: apiErr, response } = await api.GET('/admin/v1/settlements', params);
      if (handle401(response?.status, router)) return;
      if (apiErr) { setError('정산 목록 조회 실패'); return; }
      setSettlements(data?.settlements || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }

  if (!authed) return <div className="loading">인증 확인 중...</div>;

  return (
    <>
      <NavBar />
      <div className="page">
        <h1>정산 관리</h1>

        <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>상태 필터:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="">전체</option>
            <option value="DRAFT">DRAFT</option>
            <option value="READY_FOR_APPROVAL">READY_FOR_APPROVAL</option>
            <option value="APPROVED">APPROVED</option>
            <option value="COMMITTED">COMMITTED</option>
          </select>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <div className="loading">로딩 중...</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Settlement ID</th>
                <th>대상</th>
                <th>상태</th>
                <th>총액</th>
                <th>생성일</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => (
                <tr
                  key={s.settlement_id}
                  className="clickable"
                  onClick={() => router.push(`/settlements/${s.settlement_id}`)}
                >
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.settlement_id.slice(0, 8)}…</td>
                  <td>{s.target_type}/{s.target_id.slice(0, 8)}…</td>
                  <td>{statusBadge(s.status)}</td>
                  <td>{formatAmount(s.amount_total)}</td>
                  <td>{new Date(s.created_at).toLocaleDateString('ko')}</td>
                </tr>
              ))}
              {settlements.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>정산 내역이 없습니다</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
