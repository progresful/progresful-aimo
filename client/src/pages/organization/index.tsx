import { RoutedTabs } from '@/components/Tabs';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { PageContainer } from '@/components/PageContainer';
import { OrganizationSettings } from './settings';
import { OrganizationMembers } from './members/members';
import { OrganizationTeams } from './teams';
import { OrganizationTeamDetails } from './teamDetails';

const organizationRoutes = [
  {
    id: '/app/organization/settings',
    label: 'Settings',
  },
  {
    id: '/app/organization/members',
    label: 'Members',
  },
  {
    id: '/app/organization/teams',
    label: 'Teams',
  },
];

const tabPaths = new Set(organizationRoutes.map((r) => r.id));

export const OrganizationIndex = () => {
  const path = useLocation();
  const activeTab = tabPaths.has(path.pathname)
    ? path.pathname
    : path.pathname.startsWith('/app/organization/teams/')
      ? '/app/organization/teams'
      : '/app/organization/settings';

  return (
    <PageContainer title="Organization">
      <Routes>
        <Route path="/" element={<RoutedTabs items={organizationRoutes} active={activeTab} />}>
          <Route path="settings" element={<OrganizationSettings />} />
          <Route path="members" element={<OrganizationMembers />} />
          <Route path="teams" element={<OrganizationTeams />} />
          <Route path="teams/:teamId" element={<OrganizationTeamDetails />} />
          <Route index element={<Navigate to="settings" />} />
        </Route>
      </Routes>
    </PageContainer>
  );
};
