import { useEffect, useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { isLoggedIn, logout } from '../lib/auth';

export default function CasesPage() {
  const navigate = useNavigate();
  const [goToCaseId, setGoToCaseId] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) navigate('/login');
  }, [navigate]);

  function handleGoToCase(e: FormEvent) {
    e.preventDefault();
    if (goToCaseId.trim()) navigate(`/cases/${goToCaseId.trim()}`);
  }

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>📋 케이스</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/">← 홈</Link>
          <button onClick={() => { logout(); navigate('/login'); }}>로그아웃</button>
        </div>
      </div>

      <div style={{ padding: 16, border: '1px solid #f0ad4e', borderRadius: 8, background: '#fef9e7', marginBottom: 16 }}>
        ⚠️ 케이스 목록 API가 아직 제공되지 않습니다. Case ID를 직접 입력하거나 새 케이스를 생성하세요.
      </div>

      <div style={{ marginBottom: 24 }}>
        <Link to="/cases/new" style={{ display: 'inline-block', padding: '12px 24px', background: '#1976d2', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 'bold' }}>
          ➕ 새 케이스 생성
        </Link>
      </div>

      <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <h3>🔍 케이스 바로가기</h3>
        <form onSubmit={handleGoToCase} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={goToCaseId}
            onChange={(e) => setGoToCaseId(e.target.value)}
            placeholder="Case ID (UUID)"
            style={{ flex: 1, padding: 8 }}
          />
          <button type="submit" disabled={!goToCaseId.trim()} style={{ padding: '8px 16px' }}>이동 →</button>
        </form>
      </div>
    </div>
  );
}
