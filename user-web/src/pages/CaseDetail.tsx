import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { isLoggedIn } from '../lib/auth';
import TimelineSection from '../features/case/TimelineSection';
import LotsSection from '../features/case/LotsSection';
import EventsSection from '../features/case/EventsSection';

export default function CaseDetailPage() {
  const navigate = useNavigate();
  const { caseId } = useParams<{ caseId: string }>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!isLoggedIn()) navigate('/login');
  }, [navigate]);

  if (!caseId) return <p>Case ID가 없습니다.</p>;

  const handleRefreshTimeline = () => setRefreshTrigger((n) => n + 1);

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <TimelineSection caseId={caseId} refreshTrigger={refreshTrigger} />
        <LotsSection caseId={caseId} onLotCreated={handleRefreshTimeline} />
        <EventsSection caseId={caseId} onEventCreated={handleRefreshTimeline} />
      </div>
    </div>
  );
}
