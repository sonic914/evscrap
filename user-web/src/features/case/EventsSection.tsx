import { useState, FormEvent, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserApi, handle401, makeIdempotencyKey } from '../../lib/api';

interface Props {
  caseId: string;
  onEventCreated: () => void;
}

const EVENT_TYPES = [
  'CASE_CREATED',
  'LOT_CREATED',
  'INBOUND_CHECKED',
  'GRADING_COMPLETED',
  'M0_QUOTED',
  'DELTA_CALCULATED',
  'SETTLEMENT_APPROVED',
  'SETTLEMENT_COMMITTED',
] as const;

export default function EventsSection({ caseId, onEventCreated }: Props) {
  const navigate = useNavigate();
  const [eventType, setEventType] = useState<string>('INBOUND_CHECKED');
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const submittingRef = useRef(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // 연타 방지
    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);
    setResult('');

    const idempotencyKey = makeIdempotencyKey();

    try {
      const api = getUserApi();
      const payload: Record<string, unknown> = {};
      if (memo.trim()) payload.memo = memo.trim();

      const { data, error: apiErr, response } = await api.POST(
        '/user/v1/{targetType}/{targetId}/events',
        {
          params: { path: { targetType: 'CASE', targetId: caseId } },
          body: {
            event_type: eventType,
            occurred_at: new Date().toISOString(),
            payload,
          } as never,
          headers: { 'Idempotency-Key': idempotencyKey } as never,
        },
      );

      if (handle401(response?.status, navigate)) return;

      if (response?.status === 409) {
        const errBody = apiErr as Record<string, unknown> | undefined;
        const code = errBody?.code as string | undefined;
        if (code === 'IDEMPOTENCY_IN_PROGRESS') {
          setResult('⏳ 처리 중… 잠시 후 다시 시도해주세요.');
        } else if (code === 'IDEMPOTENCY_KEY_CONFLICT') {
          setResult('⚠️ 요청 충돌이 감지되었습니다.');
        } else {
          setResult('🔄 중복 요청이 감지되었습니다.');
        }
        return;
      }

      if (apiErr) {
        setResult(`❌ ${JSON.stringify(apiErr)}`);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const evId = (data as any)?.event_id;
      setResult(`✅ 이벤트 생성: ${evId || '성공'}`);
      setMemo('');
      onEventCreated();
    } catch (err) {
      setResult(`❌ ${err instanceof Error ? err.message : '오류'}`);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  return (
    <section>
      <h2>⚡ 이벤트 기록</h2>
      <form onSubmit={handleSubmit} style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 13 }}>이벤트 타입</label><br />
            <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={{ padding: 6 }}>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ fontSize: 13 }}>메모 (선택)</label><br />
            <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} style={{ padding: 6, width: '100%' }} placeholder="간단 메모" />
          </div>
          <button type="submit" disabled={loading} style={{ padding: '6px 16px' }}>
            {loading ? '기록 중…' : '이벤트 기록'}
          </button>
        </div>
        {result && (
          <div style={{ marginTop: 8, padding: 8, background: result.startsWith('✅') ? '#d4edda' : result.startsWith('❌') ? '#fdd' : '#fff3cd', borderRadius: 4, fontSize: 13 }}>
            {result}
          </div>
        )}
      </form>
    </section>
  );
}
