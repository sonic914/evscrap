import { useEffect, useState, FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { isLoggedIn } from '../lib/auth';
import { getUserApi, handle401, makeIdempotencyKey } from '../lib/api';

interface EventItem {
  event_id: string;
  event_type: string;
  occurred_at: string;
  anchor_status?: string;
  target_type: string;
  target_id: string;
}

export default function CaseDetailPage() {
  const navigate = useNavigate();
  const { caseId } = useParams<{ caseId: string }>();

  const [timeline, setTimeline] = useState<EventItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineError, setTimelineError] = useState('');

  // Lot 생성
  const [lotPartType, setLotPartType] = useState('BATTERY_PACK');
  const [lotWeightKg, setLotWeightKg] = useState('');
  const [lotResult, setLotResult] = useState('');
  const [lotLoading, setLotLoading] = useState(false);

  // Event 생성
  const [eventType, setEventType] = useState('CASE_CREATED');
  const [eventResult, setEventResult] = useState('');
  const [eventLoading, setEventLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { navigate('/login'); return; }
    fetchTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function fetchTimeline() {
    if (!caseId) return;
    setTimelineLoading(true);
    setTimelineError('');
    try {
      const api = getUserApi();
      const { data, error: apiErr, response } = await api.GET('/user/v1/{targetType}/{targetId}/timeline', {
        params: { path: { targetType: 'CASE', targetId: caseId } },
      });
      if (handle401(response?.status, navigate)) return;
      if (response?.status === 404) { setTimelineError(''); setTimeline([]); return; }
      if (apiErr) { setTimelineError('타임라인 조회 실패'); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTimeline((data as any)?.events || []);
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : '오류');
    } finally {
      setTimelineLoading(false);
    }
  }

  async function handleCreateLot(e: FormEvent) {
    e.preventDefault();
    if (!caseId) return;
    setLotLoading(true);
    setLotResult('');
    try {
      const api = getUserApi();
      const body: Record<string, unknown> = {
        parent_case_id: caseId,
        part_type: lotPartType,
        quantity: 1,
      };
      if (lotWeightKg.trim()) body.weight_kg = parseFloat(lotWeightKg);

      const { data, error: apiErr, response } = await api.POST('/user/v1/lots', {
        body: body as never,
        headers: { 'Idempotency-Key': makeIdempotencyKey() } as never,
      });
      if (handle401(response?.status, navigate)) return;
      if (response?.status === 409) { setLotResult('🔄 중복 요청'); return; }
      if (apiErr) { setLotResult(`❌ ${JSON.stringify(apiErr)}`); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lotId = (data as any)?.lot_id;
      setLotResult(`✅ LOT 생성: ${lotId || '성공'}`);
      fetchTimeline();
    } catch (err) {
      setLotResult(err instanceof Error ? err.message : '오류');
    } finally {
      setLotLoading(false);
    }
  }

  async function handleCreateEvent(e: FormEvent) {
    e.preventDefault();
    if (!caseId) return;
    setEventLoading(true);
    setEventResult('');
    try {
      const api = getUserApi();
      const { data, error: apiErr, response } = await api.POST('/user/v1/{targetType}/{targetId}/events', {
        params: { path: { targetType: 'CASE', targetId: caseId } },
        body: {
          event_type: eventType,
          occurred_at: new Date().toISOString(),
          payload: {},
        } as never,
        headers: { 'Idempotency-Key': makeIdempotencyKey() } as never,
      });
      if (handle401(response?.status, navigate)) return;
      if (response?.status === 409) { setEventResult('🔄 중복 요청'); return; }
      if (apiErr) { setEventResult(`❌ ${JSON.stringify(apiErr)}`); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const evId = (data as any)?.event_id;
      setEventResult(`✅ 이벤트 생성: ${evId || '성공'}`);
      fetchTimeline();
    } catch (err) {
      setEventResult(err instanceof Error ? err.message : '오류');
    } finally {
      setEventLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
        <Link to="/cases">← 케이스 목록</Link>
        <Link to="/">홈</Link>
      </div>

      <h1>📋 케이스 상세</h1>
      <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, marginBottom: 16, background: '#f9f9f9' }}>
        <div><strong>Case ID:</strong> <code style={{ fontSize: 12 }}>{caseId}</code></div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          ℹ️ 케이스 상세 조회 API가 없어 타임라인으로 이벤트 내역을 확인합니다.
        </div>
      </div>

      {/* 타임라인 */}
      <h2>🕐 타임라인</h2>
      {timelineError && <div style={{ padding: 12, background: '#fdd', borderRadius: 4, marginBottom: 8 }}>{timelineError}</div>}
      {timelineLoading ? (
        <p>로딩 중...</p>
      ) : timeline.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>시간</th>
              <th style={{ padding: 8 }}>이벤트 타입</th>
              <th style={{ padding: 8 }}>앵커</th>
              <th style={{ padding: 8 }}>Event ID</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((ev) => (
              <tr key={ev.event_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8, fontSize: 13 }}>{new Date(ev.occurred_at).toLocaleString('ko')}</td>
                <td style={{ padding: 8 }}>{ev.event_type}</td>
                <td style={{ padding: 8 }}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, background: ev.anchor_status === 'VERIFIED' ? '#d4edda' : ev.anchor_status === 'FAILED' ? '#f8d7da' : '#fff3cd' }}>
                    {ev.anchor_status || 'NONE'}
                  </span>
                </td>
                <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 11 }}>{ev.event_id?.slice(0, 8)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: '#666', padding: 8 }}>타임라인 이벤트가 아직 없습니다.</p>
      )}
      <button onClick={fetchTimeline} disabled={timelineLoading} style={{ marginBottom: 24, padding: '6px 16px' }}>🔄 새로고침</button>

      {/* LOT 생성 */}
      <h2>📦 LOT 추가</h2>
      <form onSubmit={handleCreateLot} style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 13 }}>부품 타입</label><br />
            <select value={lotPartType} onChange={(e) => setLotPartType(e.target.value)} style={{ padding: 6 }}>
              <option value="BATTERY_PACK">BATTERY_PACK</option>
              <option value="MOTOR">MOTOR</option>
              <option value="INVERTER">INVERTER</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13 }}>무게(kg)</label><br />
            <input type="number" value={lotWeightKg} onChange={(e) => setLotWeightKg(e.target.value)} style={{ padding: 6, width: 100 }} placeholder="250.5" />
          </div>
          <button type="submit" disabled={lotLoading} style={{ padding: '6px 16px' }}>{lotLoading ? '생성 중...' : 'LOT 생성'}</button>
        </div>
        {lotResult && <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 13 }}>{lotResult}</div>}
      </form>

      {/* 이벤트 생성 */}
      <h2>⚡ 이벤트 기록</h2>
      <form onSubmit={handleCreateEvent} style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 13 }}>이벤트 타입</label><br />
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={{ padding: 6 }}>
              <option value="CASE_CREATED">CASE_CREATED</option>
              <option value="LOT_CREATED">LOT_CREATED</option>
              <option value="INBOUND_CHECKED">INBOUND_CHECKED</option>
              <option value="GRADING_COMPLETED">GRADING_COMPLETED</option>
              <option value="M0_QUOTED">M0_QUOTED</option>
              <option value="DELTA_CALCULATED">DELTA_CALCULATED</option>
              <option value="SETTLEMENT_APPROVED">SETTLEMENT_APPROVED</option>
            </select>
          </div>
          <button type="submit" disabled={eventLoading} style={{ padding: '6px 16px' }}>{eventLoading ? '기록 중...' : '이벤트 기록'}</button>
        </div>
        {eventResult && <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 13 }}>{eventResult}</div>}
      </form>
    </div>
  );
}
