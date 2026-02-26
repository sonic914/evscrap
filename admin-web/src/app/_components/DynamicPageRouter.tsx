'use client';

import { usePathname } from 'next/navigation';
import { lazy, Suspense, type ReactNode } from 'react';

const TenantDetail = lazy(() => import('./tenant-detail'));
const CaseDetail = lazy(() => import('./case-detail'));
const SettlementDetail = lazy(() => import('./settlement-detail'));
const DisputeDetail = lazy(() => import('./dispute-detail'));

const LOADING = <div className="loading">로딩 중...</div>;

/**
 * Detects dynamic route patterns and renders the appropriate
 * client component. Falls through to children for static pages.
 */
export default function DynamicPageRouter({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // /tenants/[tenantId]/
  if (/^\/tenants\/[^/]+\/?$/.test(pathname)) {
    return <Suspense fallback={LOADING}><TenantDetail /></Suspense>;
  }

  // /cases/[caseId]/
  if (/^\/cases\/[^/]+\/?$/.test(pathname)) {
    return <Suspense fallback={LOADING}><CaseDetail /></Suspense>;
  }

  // /settlements/[id]/
  if (/^\/settlements\/[^/]+\/?$/.test(pathname)) {
    return <Suspense fallback={LOADING}><SettlementDetail /></Suspense>;
  }

  // /disputes/[disputeId]/
  if (/^\/disputes\/[^/]+\/?$/.test(pathname)) {
    return <Suspense fallback={LOADING}><DisputeDetail /></Suspense>;
  }

  return <>{children}</>;
}
