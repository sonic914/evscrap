'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '../NavBar';
import { useAuthGuard, handle401 } from '@/lib/useAuthGuard';
import { getAdminApi } from '@/lib/api';
import type { components } from '@evscrap/api-client';

type Event = components['schemas']['Event'];

function anchorBadge(status: string) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

export default function EventsPage() {
  const router = useRouter();
  const authed = useAuthGuard();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('');
  const [anchorFilter, setAnchorFilter] = useState<string>('');

  useEffect(() => {
    if (!authed) return;
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, targetTypeFilter, anchorFilter]);

  async function fetchEvents() {
    setLoading(true);
    setError('');
    try {
      const api = getAdminApi();
      const query: Record<string, string> = {};
      if (targetTypeFilter) query.target_type = targetTypeFilter;
      if (anchorFilter) query.anchor_status = anchorFilter;
      const { data, error: apiErr, response } = await api.GET('/admin/v1/events', {
        params: { query: query as { target_type?: components['schemas']['TargetType']; anchor_status?: components['schemas']['AnchorStatus'] } },
      });
      if (handle401(response?.status, router)) return;
      if (apiErr) { setError('이벤트 목록 조회 실패'); return; }
      setEvents(data?.events || []);
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
        <h1>이벤트 조회</h1>

        <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontWeight: 600, fontSize: 14 }}>대상:</label>
            <select value={targetTypeFilter} onChange={(e) => setTargetTypeFilter(e.target.value)} style={{ width: 'auto' }}>
              <option value="">전체</option>
              <option value="CASE">CASE</option>
              <option value="LOT">LOT</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontWeight: 600, fontSize: 14 }}>앵커:</label>
            <select value={anchorFilter} onChange={(e) => setAnchorFilter(e.target.value)} style={{ width: 'auto' }}>
              <option value="">전체</option>
              <option value="NONE">NONE</option>
              <option value="PENDING">PENDING</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="FAILED">FAILED</option>
            </select>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <div className="loading">로딩 중...</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>이벤트 타입</th>
                <th>대상</th>
                <th>앵커 상태</th>
                <th>발생일</th>
                <th>Event ID</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.event_id}>
                  <td>{ev.event_type}</td>
                  <td>{ev.target_type}/{ev.target_id.slice(0, 8)}…</td>
                  <td>{anchorBadge(ev.anchor_status)}</td>
                  <td>{new Date(ev.occurred_at).toLocaleString('ko')}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{ev.event_id.slice(0, 8)}…</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>이벤트가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
