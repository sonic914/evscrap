import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserApi, handle401 } from '../../lib/api';

export interface TimelineEvent {
  event_id: string;
  event_type: string;
  occurred_at: string;
  anchor_status?: string;
  target_type?: string;
  target_id?: string;
}

interface Props {
  caseId: string;
  /** 외부에서 refetch를 트리거하기 위한 카운터 */
  refreshTrigger: number;
}

export default function TimelineSection({ caseId, refreshTrigger }: Props) {
  const navigate = useNavigate();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const api = getUserApi();
      const { data, error: apiErr, response } = await api.GET(
        '/user/v1/{targetType}/{targetId}/timeline',
        { params: { path: { targetType: 'CASE', targetId: caseId } } },
      );
      if (handle401(response?.status, navigate)) return;
      if (response?.status === 404) { setEvents([]); return; }
      if (apiErr) { setError('타임라인 조회 실패'); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = ((data as any)?.events || []) as TimelineEvent[];
      setEvents(list.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()));
    } catch (err) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally {
      setLoading(false);
    }
  }, [caseId, navigate]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline, refreshTrigger]);

  const anchorBg = (s?: string) =>
    s === 'VERIFIED' ? '#d4edda' : s === 'FAILED' ? '#f8d7da' : s === 'PENDING' ? '#cce5ff' : '#fff3cd';

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>🕐 타임라인</h2>
        <button onClick={fetchTimeline} disabled={loading} style={{ padding: '4px 12px', fontSize: 13 }}>
          {loading ? '로딩…' : '🔄 새로고침'}
        </button>
      </div>

      {error && <div style={{ padding: 10, background: '#fdd', borderRadius: 4, marginBottom: 8 }}>{error}</div>}

      {!loading && events.length === 0 && !error && (
        <p style={{ color: '#888', padding: 8 }}>타임라인 이벤트가 아직 없습니다.</p>
      )}

      {events.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>시간</th>
              <th style={{ padding: 8 }}>이벤트</th>
              <th style={{ padding: 8 }}>앵커</th>
              <th style={{ padding: 8 }}>ID</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.event_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8, fontSize: 13 }}>{new Date(ev.occurred_at).toLocaleString('ko')}</td>
                <td style={{ padding: 8, fontSize: 13 }}>{ev.event_type}</td>
                <td style={{ padding: 8 }}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, background: anchorBg(ev.anchor_status) }}>
                    {ev.anchor_status || 'NONE'}
                  </span>
                </td>
                <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 11 }}>{ev.event_id?.slice(0, 8)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
