import { Navigate, Route, Routes } from 'react-router';
import { UserProfile } from './userProfile';
import { PageContainer } from '@/components/PageContainer';

export const UserSettings = () => {
  return (
    <PageContainer title="Profile">
      <Routes>
        <Route path="settings" element={<UserProfile />} />
        <Route index element={<Navigate to="settings" />} />
        <Route path="*" element={<Navigate to="settings" />} />
      </Routes>
    </PageContainer>
  );
};
