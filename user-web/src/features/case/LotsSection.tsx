import { useState, FormEvent, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserApi, handle401, makeIdempotencyKey } from '../../lib/api';

interface LotItem {
  lot_id: string;
  part_type: string;
  weight_kg?: number;
  quantity?: number;
  created_at?: string;
}

interface Props {
  caseId: string;
  onLotCreated: () => void;
}

const PART_TYPES = ['BATTERY_PACK', 'MOTOR', 'INVERTER', 'OTHER'] as const;

export default function LotsSection({ caseId, onLotCreated }: Props) {
  const navigate = useNavigate();
  const [lots, setLots] = useState<LotItem[]>([]);
  const [partType, setPartType] = useState<string>('BATTERY_PACK');
  const [weightKg, setWeightKg] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const submittingRef = useRef(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // 연타 방지: submittingRef로 이중 차단
    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);
    setResult('');

    const idempotencyKey = makeIdempotencyKey();

    try {
      const api = getUserApi();
      const body: Record<string, unknown> = {
        parent_case_id: caseId,
        part_type: partType,
        quantity: 1,
      };
      if (weightKg.trim()) body.weight_kg = parseFloat(weightKg);

      const { data, error: apiErr, response } = await api.POST('/user/v1/lots', {
        body: body as never,
        headers: { 'Idempotency-Key': idempotencyKey } as never,
      });

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
      const d = data as any;
      const newLot: LotItem = {
        lot_id: d?.lot_id || 'unknown',
        part_type: partType,
        weight_kg: weightKg ? parseFloat(weightKg) : undefined,
        quantity: 1,
        created_at: new Date().toISOString(),
      };
      setLots((prev) => [...prev, newLot]);
      setResult(`✅ LOT 생성: ${newLot.lot_id}`);
      setWeightKg('');
      onLotCreated();
    } catch (err) {
      setResult(`❌ ${err instanceof Error ? err.message : '오류'}`);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  return (
    <section>
      <h2>📦 LOT</h2>

      {/* 로컬 누적 LOT 목록 */}
      {lots.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #333', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>LOT ID</th>
              <th style={{ padding: 6 }}>부품</th>
              <th style={{ padding: 6 }}>무게(kg)</th>
              <th style={{ padding: 6 }}>생성 시각</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <tr key={lot.lot_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>{lot.lot_id.slice(0, 8)}…</td>
                <td style={{ padding: 6, fontSize: 13 }}>{lot.part_type}</td>
                <td style={{ padding: 6, fontSize: 13 }}>{lot.weight_kg ?? '-'}</td>
                <td style={{ padding: 6, fontSize: 12 }}>{lot.created_at ? new Date(lot.created_at).toLocaleTimeString('ko') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {lots.length === 0 && (
        <p style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>
          이 세션에서 생성한 LOT가 없습니다. (목록 API 미지원 → 로컬 누적)
        </p>
      )}

      {/* LOT 추가 폼 */}
      <form onSubmit={handleSubmit} style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 13 }}>부품 타입</label><br />
            <select value={partType} onChange={(e) => setPartType(e.target.value)} style={{ padding: 6 }}>
              {PART_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13 }}>무게(kg)</label><br />
            <input type="number" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} style={{ padding: 6, width: 100 }} placeholder="250.5" />
          </div>
          <button type="submit" disabled={loading} style={{ padding: '6px 16px' }}>
            {loading ? '생성 중…' : 'LOT 추가'}
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
