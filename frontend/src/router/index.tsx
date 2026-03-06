import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { CommunityManagementPage } from '../pages/CommunityManagementPage';
import { OperationLogsPage } from '../pages/OperationLogsPage';
import { OverviewPage } from '../pages/OverviewPage';
import { UsersPlaceholderPage } from '../pages/UsersPlaceholderPage';
import { WhitelistManagementPage } from '../pages/WhitelistManagementPage';

export const AppRouter = () => {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/communities" element={<CommunityManagementPage />} />
        <Route path="/whitelist" element={<WhitelistManagementPage />} />
        <Route path="/users" element={<UsersPlaceholderPage />} />
        <Route path="/operation-logs" element={<OperationLogsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
