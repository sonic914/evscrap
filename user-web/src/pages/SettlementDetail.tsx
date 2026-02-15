import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { isLoggedIn } from '../lib/auth';
import { getUserApi, handle401 } from '../lib/api';
import { formatAmount } from '../lib/money';

interface Settlement {
  settlement_id: string;
  target_type: string;
  target_id: string;
  status: string;
  amount_min?: number;
  amount_bonus?: number;
  amount_total: number;
  receipt_hash?: string;
  created_at: string;
  updated_at?: string;
}

interface BreakdownItem {
  id: string;
  code: string;
  title: string;
  category: string;
  amount: number;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  evidence_ref?: string | null;
  note?: string | null;
  created_at: string;
}

interface BreakdownData {
  settlement_id: string;
  items: BreakdownItem[];
  summary: { min: number; bonus: number; deduction: number; other: number; total: number };
  consistency: { rule: string; ok: boolean };
}

const CATEGORY_LABELS: Record<string, string> = {
  MIN: '최소 보장',
  BONUS: '보너스',
  DEDUCTION: '차감',
  LOGISTICS: '물류비',
  OTHER: '기타',
};

const CATEGORY_COLORS: Record<string, string> = {
  MIN: '#17a2b8',
  BONUS: '#28a745',
  DEDUCTION: '#dc3545',
  LOGISTICS: '#fd7e14',
  OTHER: '#6c757d',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6c757d',
  READY_FOR_APPROVAL: '#fd7e14',
  APPROVED: '#28a745',
  COMMITTED: '#007bff',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '초안',
  READY_FOR_APPROVAL: '승인 대기',
  APPROVED: '승인됨',
  COMMITTED: '확정(커밋)',
};

export default function SettlementDetailPage() {
  const navigate = useNavigate();
  const { targetType, targetId } = useParams<{ targetType: string; targetId: string }>();
  const [data, setData] = useState<Settlement | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) navigate('/login');
  }, [navigate]);

  const fetchSettlement = useCallback(async () => {
    if (!targetType || !targetId) return;
    setLoading(true);
    setError('');
    try {
      const api = getUserApi();
      const { data: d, error: apiErr, response } = await api.GET(
        '/user/v1/{targetType}/{targetId}/settlement',
        { params: { path: { targetType: targetType as 'CASE' | 'LOT', targetId } } },
      );
      if (handle401(response?.status, navigate)) return;
      if (response?.status === 404) { setError('정산 정보가 아직 없습니다.'); setData(null); return; }
      if (apiErr || !d) { setError(`조회 실패: ${JSON.stringify(apiErr)}`); return; }
      setData(d as unknown as Settlement);
      // breakdown 로드
      try {
        const bdRes = await api.GET(
          '/user/v1/{targetType}/{targetId}/settlement/breakdown' as any,
          { params: { path: { targetType: targetType as 'CASE' | 'LOT', targetId } } },
        );
        if (bdRes.response?.ok && bdRes.data) {
          setBreakdown(bdRes.data as unknown as BreakdownData);
        }
      } catch { /* breakdown 실패해도 settlement은 표시 */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : '네트워크 오류');
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId, navigate]);

  useEffect(() => { fetchSettlement(); }, [fetchSettlement]);

  const isGateBlocking = data && (data.status === 'DRAFT' || data.status === 'READY_FOR_APPROVAL');

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
        <Link to="/settlements">← 정산</Link>
        {targetType === 'CASE' && targetId && <Link to={`/cases/${targetId}`}>📋 케이스 상세</Link>}
        <Link to="/">홈</Link>
      </div>

      <h1>💰 정산 상세</h1>

      {loading && <p>로딩 중...</p>}
      {error && <div style={{ padding: 12, background: '#fdd', borderRadius: 4, marginBottom: 16 }}>{error}<br /><button onClick={fetchSettlement} style={{ marginTop: 8, padding: '4px 12px' }}>🔄 재시도</button></div>}

      {data && (
        <>
          {/* Summary 카드 */}
          <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8, marginBottom: 16, background: '#f9f9f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 'bold' }}>정산 ID</span>
              <span style={{ padding: '4px 12px', borderRadius: 12, color: '#fff', fontSize: 13, background: STATUS_COLORS[data.status] || '#999' }}>
                {STATUS_LABELS[data.status] || data.status}
              </span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}>{data.settlement_id}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><span style={{ color: '#666', fontSize: 12 }}>대상</span><br />{data.target_type} / <code style={{ fontSize: 11 }}>{data.target_id.slice(0, 8)}…</code></div>
              <div><span style={{ color: '#666', fontSize: 12 }}>총액</span><br /><strong style={{ fontSize: 18 }}>{formatAmount(data.amount_total)}</strong></div>
              {data.amount_min != null && <div><span style={{ color: '#666', fontSize: 12 }}>최소 보장</span><br />{formatAmount(data.amount_min)}</div>}
              {data.amount_bonus != null && <div><span style={{ color: '#666', fontSize: 12 }}>보너스</span><br />{formatAmount(data.amount_bonus)}</div>}
              <div><span style={{ color: '#666', fontSize: 12 }}>생성</span><br /><span style={{ fontSize: 13 }}>{new Date(data.created_at).toLocaleString('ko')}</span></div>
              {data.updated_at && <div><span style={{ color: '#666', fontSize: 12 }}>수정</span><br /><span style={{ fontSize: 13 }}>{new Date(data.updated_at).toLocaleString('ko')}</span></div>}
            </div>
            {data.receipt_hash && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>영수증 해시: {data.receipt_hash.slice(0, 12)}…</div>
            )}
          </div>

          {/* Gate 경고 배너 */}
          {isGateBlocking && (
            <div style={{ padding: 16, border: '2px solid #dc3545', borderRadius: 8, background: '#f8d7da', marginBottom: 16 }}>
              <strong>⚠️ 정산 미확정</strong>
              <p style={{ margin: '8px 0 0', fontSize: 14 }}>
                {data.status === 'DRAFT'
                  ? '정산이 아직 초안 상태입니다. 일부 이벤트가 블록체인 앵커링(Anchor) 검증이 끝나지 않았거나, 필요한 데이터가 완성되지 않았을 수 있습니다.'
                  : '정산이 승인 대기 중입니다. 관리자가 검토 후 승인합니다.'}
              </p>
              <button onClick={fetchSettlement} style={{ marginTop: 8, padding: '4px 12px', fontSize: 13 }}>🔄 새로고침</button>
            </div>
          )}

          {data.status === 'APPROVED' && (
            <div style={{ padding: 12, border: '1px solid #28a745', borderRadius: 8, background: '#d4edda', marginBottom: 16 }}>
              ✅ 정산이 승인되었습니다. 관리자 커밋(확정) 후 최종 처리됩니다.
            </div>
          )}

          {data.status === 'COMMITTED' && (
            <div style={{ padding: 12, border: '1px solid #007bff', borderRadius: 8, background: '#cce5ff', marginBottom: 16 }}>
              🎉 정산이 확정(커밋)되었습니다.
            </div>
          )}

          {/* Breakdown 상세 항목 */}
          <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8, marginBottom: 16 }}>
            <h3>📊 정산 구성</h3>
            {breakdown && breakdown.items.length > 0 ? (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                      <th style={{ padding: 8 }}>항목</th>
                      <th style={{ padding: 8, textAlign: 'center' }}>분류</th>
                      <th style={{ padding: 8, textAlign: 'right' }}>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.items.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: 8 }}>
                          <div>{item.title}</div>
                          {item.note && <div style={{ fontSize: 11, color: '#999' }}>{item.note}</div>}
                          {item.quantity != null && item.unit && (
                            <div style={{ fontSize: 11, color: '#888' }}>
                              {item.quantity} {item.unit}
                              {item.unit_price != null && ` × ${formatAmount(item.unit_price)}`}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 8, fontSize: 11, color: '#fff',
                            background: CATEGORY_COLORS[item.category] || '#999',
                          }}>
                            {CATEGORY_LABELS[item.category] || item.category}
                          </span>
                        </td>
                        <td style={{ padding: 8, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: item.amount < 0 ? '#dc3545' : undefined }}>
                          {formatAmount(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #333', fontWeight: 'bold' }}>
                      <td colSpan={2} style={{ padding: 8 }}>합계</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(breakdown.summary.total)}</td>
                    </tr>
                  </tfoot>
                </table>
                {/* 카테고리 요약 */}
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, flexWrap: 'wrap' }}>
                  {breakdown.summary.min > 0 && <span>최소보장: {formatAmount(breakdown.summary.min)}</span>}
                  {breakdown.summary.bonus > 0 && <span style={{ color: '#28a745' }}>보너스: +{formatAmount(breakdown.summary.bonus)}</span>}
                  {breakdown.summary.deduction < 0 && <span style={{ color: '#dc3545' }}>차감: {formatAmount(breakdown.summary.deduction)}</span>}
                </div>
                {/* 정합성 표시 */}
                {!breakdown.consistency.ok && (
                  <div style={{ marginTop: 8, padding: 8, background: '#fff3cd', borderRadius: 4, fontSize: 12, color: '#856404' }}>
                    ⚠️ 항목 합계({formatAmount(breakdown.summary.total)})가 정산 총액({formatAmount(data.amount_total)})과 일치하지 않습니다.
                  </div>
                )}
              </>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {data.amount_min != null && (
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: 8, color: '#666' }}>최소 보장 금액</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(data.amount_min)}</td>
                    </tr>
                  )}
                  {data.amount_bonus != null && (
                    <tr style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: 8, color: '#666' }}>보너스</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(data.amount_bonus)}</td>
                    </tr>
                  )}
                  <tr style={{ borderTop: '2px solid #333', fontWeight: 'bold' }}>
                    <td style={{ padding: 8 }}>합계</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatAmount(data.amount_total)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* 읽기 전용 안내 */}
          <div style={{ padding: 12, background: '#e8f4fd', borderRadius: 8, fontSize: 13, color: '#555' }}>
            ℹ️ 현재 사용자는 조회만 가능합니다. 승인/커밋은 관리자가 처리합니다.
          </div>
        </>
      )}
    </div>
  );
}
