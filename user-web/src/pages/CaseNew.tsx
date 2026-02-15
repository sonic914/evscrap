import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { isLoggedIn } from '../lib/auth';
import { getUserApi, handle401, makeIdempotencyKey } from '../lib/api';

export default function CaseNewPage() {
  const navigate = useNavigate();
  const [vin, setVin] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [idempotencyKey] = useState(() => makeIdempotencyKey());

  useEffect(() => {
    if (!isLoggedIn()) navigate('/login');
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vin.trim()) { setError('VIN은 필수입니다'); return; }
    setLoading(true);
    setError('');

    try {
      const api = getUserApi();
      const body: Record<string, unknown> = { vin: vin.trim() };
      if (make.trim()) body.make = make.trim();
      if (model.trim()) body.model = model.trim();
      if (year.trim()) body.year = parseInt(year.trim(), 10);

      const { data, error: apiErr, response } = await api.POST('/user/v1/cases', {
        body: body as never,
        headers: { 'Idempotency-Key': idempotencyKey } as never,
      });

      if (handle401(response?.status, navigate)) return;

      if (response?.status === 409) {
        setError('🔄 중복 요청이 감지되었습니다. 이미 생성된 케이스가 있을 수 있습니다.');
        return;
      }

      if (apiErr || !data) {
        const errMsg = typeof apiErr === 'object' && apiErr !== null
          ? JSON.stringify(apiErr)
          : '케이스 생성 실패';
        setError(`❌ ${errMsg}`);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const caseId = (data as any)?.case_id || (data as any)?.caseId;
      if (caseId) {
        navigate(`/cases/${caseId}`);
      } else {
        setError('케이스가 생성되었지만 ID를 확인할 수 없습니다.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 500, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/cases">← 케이스 목록</Link>
      </div>
      <h1>➕ 새 케이스 생성</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label><strong>VIN</strong> <span style={{ color: 'red' }}>*</span></label>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
            VIN(차량식별번호): 차량 고유 식별 문자열(보통 17자리)
          </div>
          <input type="text" value={vin} onChange={(e) => setVin(e.target.value)} required style={{ width: '100%', padding: 8 }} placeholder="KMHXX00XXXX000000" />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>제조사 (make)</label>
          <input type="text" value={make} onChange={(e) => setMake(e.target.value)} style={{ width: '100%', padding: 8 }} placeholder="현대" />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>모델 (model)</label>
          <input type="text" value={model} onChange={(e) => setModel(e.target.value)} style={{ width: '100%', padding: 8 }} placeholder="아이오닉5" />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>연식 (year)</label>
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: '100%', padding: 8 }} placeholder="2023" />
        </div>

        {error && <div style={{ padding: 12, background: '#fdd', border: '1px solid #c00', borderRadius: 4, marginBottom: 12 }}>{error}</div>}

        <button type="submit" disabled={loading || !vin.trim()} style={{ padding: '10px 24px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {loading ? '생성 중...' : '케이스 생성'}
        </button>
      </form>
    </div>
  );
}
