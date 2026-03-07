import { Spin } from '@arco-design/web-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAppStore } from '../contexts/AppStoreContext';
import { AppLayout } from '../layouts/AppLayout';
import { PublicLayout } from '../layouts/PublicLayout';
import { BanManagementPage } from '../pages/BanManagementPage';
import { CommunityManagementPage } from '../pages/CommunityManagementPage';
import { LoginPage } from '../pages/LoginPage';
import { OperationLogsPage } from '../pages/OperationLogsPage';
import { OverviewPage } from '../pages/OverviewPage';
import { PublicBanNoticePage } from '../pages/PublicBanNoticePage';
import { PublicWhitelistApplyPage } from '../pages/PublicWhitelistApplyPage';
import { PublicWhitelistNoticePage } from '../pages/PublicWhitelistNoticePage';
import { UsersPlaceholderPage } from '../pages/UsersPlaceholderPage';
import { WhitelistManagementPage } from '../pages/WhitelistManagementPage';

const FullscreenSpin = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Spin size={36} />
  </div>
);

const ProtectedLayout = () => {
  const { bootstrapping, isAuthenticated } = useAppStore();

  if (bootstrapping) {
    return <FullscreenSpin />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout />;
};

const LoginRoute = () => {
  const { bootstrapping, isAuthenticated } = useAppStore();

  if (bootstrapping) {
    return <FullscreenSpin />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <LoginPage />;
};

export const AppRouter = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<PublicLayout />}>
        <Route path="/public/whitelist/apply" element={<PublicWhitelistApplyPage />} />
        <Route path="/public/whitelist" element={<PublicWhitelistNoticePage />} />
        <Route path="/public/bans" element={<PublicBanNoticePage />} />
      </Route>
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/communities" element={<CommunityManagementPage />} />
        <Route path="/whitelist" element={<WhitelistManagementPage />} />
        <Route path="/bans" element={<BanManagementPage />} />
        <Route path="/users" element={<UsersPlaceholderPage />} />
        <Route path="/operation-logs" element={<OperationLogsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};
