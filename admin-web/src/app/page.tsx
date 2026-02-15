'use client';

import Link from 'next/link';
import NavBar from './NavBar';
import { useAuthGuard } from '@/lib/useAuthGuard';

export default function DashboardPage() {
  const authed = useAuthGuard();
  if (!authed) return <div className="loading">인증 확인 중...</div>;

  return (
    <>
      <NavBar />
      <div className="page">
        <h1>관리자 대시보드</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
          <DashCard href="/tenants" title="테넌트 관리" desc="폐차장 등록 조회 및 승인" />
          <DashCard href="/cases" title="케이스 관리" desc="폐차 케이스 목록/상세/타임라인/증빙" />
          <DashCard href="/settlements" title="정산 관리" desc="정산 승인/확정 (앵커 게이트)" />
          <DashCard href="/events" title="이벤트 조회" desc="이벤트 목록 및 앵커 상태 확인" />
          <DashCard href="/audit/missing-anchors" title="🔍 앵커 감사" desc="누락 앵커 탐지 및 조치" />
          <DashCard href="#" title="📋 정책 (미완성)" desc="Policies — 백엔드 list API 추가 시 P2-1.7에서 구현" />
        </div>
      </div>
    </>
  );
}

function DashCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="detail-card" style={{ cursor: 'pointer' }}>
        <h2 style={{ marginBottom: 8 }}>{title}</h2>
        <p style={{ color: '#666', fontSize: 14 }}>{desc}</p>
      </div>
    </Link>
  );
}
