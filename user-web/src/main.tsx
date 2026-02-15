import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import CasesPage from './pages/Cases';
import CaseNewPage from './pages/CaseNew';
import CaseDetailPage from './pages/CaseDetail';
import SettlementsPage from './pages/Settlements';
import SettlementDetailPage from './pages/SettlementDetail';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<DashboardPage />} />
        <Route path="/cases" element={<CasesPage />} />
        <Route path="/cases/new" element={<CaseNewPage />} />
        <Route path="/cases/:caseId" element={<CaseDetailPage />} />
        <Route path="/settlements" element={<SettlementsPage />} />
        <Route path="/settlements/:targetType/:targetId" element={<SettlementDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
