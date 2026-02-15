'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import NavBar from '../../NavBar';
import { useAuthGuard, handle401 } from '@/lib/useAuthGuard';
import { adminGet } from '@/lib/api';

interface CaseDetail {
  case_id: string;
  vin: string;
  make?: string;
  model?: string;
  year?: number;
  tenant_id: string;
  created_at: string;
  lots?: LotItem[];
  event_count?: number;
  latest_event?: EventItem | null;
}

interface LotItem {
  lot_id: string;
  part_type: string;
  quantity: number;
  weight_kg?: number;
  created_at: string;
}

interface EventItem {
  event_id: string;
  event_type: string;
  occurred_at: string;
  anchor_status: string;
  canonical_hash?: string;
  target_type: string;
  target_id: string;
  payload?: Record<string, unknown>;
}

interface EvidenceItem {
  evidence_id: string;
  s3_key: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  presigned_url?: string | null;
  presign_expires_in?: number;
}

function anchorBadge(status: string) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CaseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const caseId = params.caseId as string;
  const authed = useAuthGuard();

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [caseLoading, setCaseLoading] = useState(true);
  const [caseError, setCaseError] = useState('');

  const [timeline, setTimeline] = useState<EventItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineError, setTimelineError] = useState('');

  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  const [evidenceError, setEvidenceError] = useState('');

  useEffect(() => {
    if (!authed) return;
    fetchCase();
    fetchTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, caseId]);

  async function fetchCase() {
    setCaseLoading(true);
    setCaseError('');
    try {
      const { data, error: apiErr, response } = await adminGet('/admin/v1/cases/{caseId}', {
        params: { path: { caseId } },
      });
      if (handle401(response?.status, router)) return;
      if (apiErr || !data) { setCaseError('케이스 조회 실패'); return; }
      const d = data as any;
      setCaseData(d);
      // evidence는 tenant_id 기반이므로 case 로드 후 호출
      if (d.tenant_id) fetchEvidence(d.tenant_id);
      else setEvidenceLoading(false);
    } catch (err) {
      setCaseError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setCaseLoading(false);
    }
  }

  async function fetchTimeline() {
    setTimelineLoading(true);
    setTimelineError('');
    try {
      const { data, error: apiErr, response } = await adminGet('/admin/v1/{targetType}/{targetId}/timeline', {
        params: { path: { targetType: 'CASE', targetId: caseId } },
      });
      if (handle401(response?.status, router)) return;
      if (apiErr) { setTimelineError('타임라인 조회 실패'); return; }
      setTimeline((data as any)?.events || []);
    } catch (err) {
      setTimelineError(err instanceof Error ? err.message : '타임라인 오류');
    } finally {
      setTimelineLoading(false);
    }
  }

  async function fetchEvidence(tenantId: string) {
    setEvidenceLoading(true);
    setEvidenceError('');
    try {
      const { data, error: apiErr, response } = await adminGet('/admin/v1/evidence', {
        params: { query: { tenant_id: tenantId } },
      });
      if (handle401(response?.status, router)) return;
      if (apiErr) { setEvidenceError('증빙 조회 실패'); return; }
      setEvidence((data as any)?.items || []);
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : '증빙 오류');
    } finally {
      setEvidenceLoading(false);
    }
  }

  if (!authed) return <div className="loading">인증 확인 중...</div>;

  return (
    <>
      <NavBar />
      <div className="page">
        <div style={{ marginBottom: 16 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); router.push('/cases'); }}>← 케이스 목록</a>
        </div>
        <h1>케이스 상세</h1>

        {/* A) Case Summary */}
        {caseError && <div className="alert alert-error">{caseError}</div>}
        {caseLoading ? (
          <div className="loading">케이스 로딩 중...</div>
        ) : caseData ? (
          <div className="detail-card">
            <div className="detail-row"><span className="detail-label">Case ID</span><span className="detail-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{caseData.case_id}</span></div>
            <div className="detail-row"><span className="detail-label">VIN</span><span className="detail-value">{caseData.vin}</span></div>
            <div className="detail-row"><span className="detail-label">차량</span><span className="detail-value">{[caseData.make, caseData.model, caseData.year].filter(Boolean).join(' ') || '-'}</span></div>
            <div className="detail-row"><span className="detail-label">Tenant ID</span><span className="detail-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{caseData.tenant_id}</span></div>
            <div className="detail-row"><span className="detail-label">생성일</span><span className="detail-value">{new Date(caseData.created_at).toLocaleString('ko')}</span></div>
            <div className="detail-row"><span className="detail-label">이벤트 수</span><span className="detail-value">{caseData.event_count ?? '-'}</span></div>
            {caseData.latest_event && (
              <div className="detail-row"><span className="detail-label">최신 이벤트</span><span className="detail-value">{caseData.latest_event.event_type} — {anchorBadge(caseData.latest_event.anchor_status)}</span></div>
            )}
          </div>
        ) : (
          <div className="alert alert-error">케이스를 찾을 수 없습니다</div>
        )}

        {/* B) Lots */}
        {caseData?.lots && caseData.lots.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h2>부품 (Lots)</h2>
            <table>
              <thead>
                <tr>
                  <th>Lot ID</th>
                  <th>부품 타입</th>
                  <th>수량</th>
                  <th>무게(kg)</th>
                  <th>생성일</th>
                </tr>
              </thead>
              <tbody>
                {caseData.lots.map((lot) => (
                  <tr key={lot.lot_id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{lot.lot_id.slice(0, 8)}…</td>
                    <td>{lot.part_type}</td>
                    <td>{lot.quantity}</td>
                    <td>{lot.weight_kg ?? '-'}</td>
                    <td>{new Date(lot.created_at).toLocaleDateString('ko')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* C) Timeline */}
        <div style={{ marginTop: 24 }}>
          <h2>타임라인 (Events)</h2>
          {timelineError && <div className="alert alert-error">{timelineError}</div>}
          {timelineLoading ? (
            <div className="loading">타임라인 로딩 중...</div>
          ) : timeline.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>시간</th>
                  <th>이벤트 타입</th>
                  <th>앵커 상태</th>
                  <th>Hash</th>
                  <th>Event ID</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((ev) => (
                  <tr key={ev.event_id}>
                    <td>{new Date(ev.occurred_at).toLocaleString('ko')}</td>
                    <td>{ev.event_type}</td>
                    <td>{anchorBadge(ev.anchor_status)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{ev.canonical_hash?.slice(0, 12) ?? '-'}…</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{ev.event_id.slice(0, 8)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#666', padding: 16 }}>타임라인 이벤트가 없습니다</p>
          )}
        </div>

        {/* D) Evidence */}
        <div style={{ marginTop: 24 }}>
          <h2>증빙 (Evidence)</h2>
          <div className="alert alert-warning" style={{ marginBottom: 8 }}>
            ⚠️ Evidence는 테넌트 기준 조회입니다 (케이스 직접 연결은 향후 스키마 확장 필요)
          </div>
          {evidenceError && <div className="alert alert-error">{evidenceError}</div>}
          {evidenceLoading ? (
            <div className="loading">증빙 로딩 중...</div>
          ) : evidence.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Evidence ID</th>
                  <th>파일 타입</th>
                  <th>크기</th>
                  <th>업로드일</th>
                  <th>열기</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((ev) => (
                  <tr key={ev.evidence_id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{ev.evidence_id.slice(0, 8)}…</td>
                    <td>{ev.mime_type}</td>
                    <td>{formatBytes(ev.size_bytes)}</td>
                    <td>{new Date(ev.uploaded_at).toLocaleDateString('ko')}</td>
                    <td>
                      {ev.presigned_url ? (
                        <a href={ev.presigned_url} target="_blank" rel="noopener noreferrer">Open ↗</a>
                      ) : (
                        <span style={{ color: '#999', fontSize: 12 }}>URL 미제공</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#666', padding: 16 }}>증빙이 없습니다</p>
          )}
        </div>

        {/* E) Settlement 연계 */}
        <div style={{ marginTop: 24 }}>
          <h2>정산 연계</h2>
          <div className="detail-card">
            <p style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>케이스와 정산은 자동 매핑되지 않습니다. 정산 ID를 직접 입력하세요.</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const sid = (form.elements.namedItem('sid') as HTMLInputElement).value.trim();
              if (sid) router.push(`/settlements/${sid}`);
            }} style={{ display: 'flex', gap: 8 }}>
              <input name="sid" type="text" placeholder="Settlement ID" style={{ width: 300 }} />
              <button type="submit">정산 상세 →</button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
