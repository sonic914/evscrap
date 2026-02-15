import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isLoggedIn, logout } from '../lib/auth';
import { getUserApi } from '../lib/api';

export default function CasesPage() {
  const navigate = useNavigate();
  const [vin, setVin] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      navigate('/login');
    }
  }, [navigate]);

  async function handleCreateCase() {
    setLoading(true);
    setResult('');
    try {
      const api = getUserApi();
      const { data, error } = await api.POST('/user/v1/cases', {
        body: { vin, make, model } as never,
        headers: { 'Idempotency-Key': crypto.randomUUID() } as never,
      });
      if (error) {
        setResult(`❌ 실패: ${JSON.stringify(error)}`);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const caseId = (data as any)?.case_id || (data as any)?.caseId || JSON.stringify(data);
        setResult(`✅ 케이스 생성: ${caseId}`);
      }
    } catch (err: unknown) {
      setResult(`❌ ${err instanceof Error ? err.message : '오류'}`);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>케이스 등록</h1>
        <button onClick={handleLogout}>로그아웃</button>
      </div>

      <div style={{ maxWidth: 400, marginTop: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label>VIN</label><br />
          <input
            type="text"
            value={vin}
            onChange={(e) => setVin(e.target.value)}
            required
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>제조사 (make)</label><br />
          <input
            type="text"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>모델 (model)</label><br />
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </div>
        <button onClick={handleCreateCase} disabled={loading || !vin} style={{ padding: '8px 24px' }}>
          {loading ? '생성 중...' : '케이스 생성'}
        </button>
      </div>

      {result && (
        <pre style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          {result}
        </pre>
      )}
    </div>
  );
}
