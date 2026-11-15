import { Navigate, Route, Routes } from 'react-router';

import { AppShell } from './components/AppShell';
import { PublicLayout } from './components/PublicLayout';
import { AgentsPage } from './pages/agents';
import { ApprovalsPage } from './pages/approvals';
import { AuditPage } from './pages/audit';
import { CatalogPage } from './pages/catalog';
import { OrdersPage } from './pages/orders';
import { PoliciesPage } from './pages/policies';
import { Landing } from './pages/Landing';
import { PlaybookPage } from './pages/playbook';
import { HomePage } from './pages/home';
import { StandingOrdersPage } from './pages/home/Standing';
import { TryItPage } from './pages/tryit';
import { NewOrderPage, RunOrderPage } from './pages/workspace';
import { AppGate, SessionProvider, useUser } from './providers/session';
import { UserSettings } from './pages/user';
import { OrganizationIndex } from './pages/organization';
import { CreateOrganization } from './pages/auth/createOrganization';
import { AcceptInvitation } from './pages/auth/acceptInvite';
import { Login } from './pages/auth/login';

const App = () => {
  return (
    <SessionProvider>
      <Routes>
        {/* Landing and auth pages are full-bleed; PublicLayout only wraps the invite flow. */}
        <Route index element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Navigate to="/login" replace />} />
        <Route element={<PublicLayout />}>
          <Route path="/accept-invitation/:inviteId" element={<PublicAcceptInvitation />} />
        </Route>

        {/* Protected — everything under /app requires an authenticated session. */}
        <Route path="/app" element={<AppGate />}>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="new" element={<NewOrderPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="activity" element={<OrdersPage />} />
            <Route path="runs/:orderId" element={<RunOrderPage />} />
            <Route path="policy" element={<PoliciesPage />} />
            <Route path="policy/graph" element={<PlaybookPage />} />
            <Route path="standing" element={<StandingOrdersPage />} />
            <Route path="try" element={<TryItPage />} />
            {/* Gateway internals, under "More" in the sidebar. */}
            <Route path="agents" element={<AgentsPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="audit" element={<AuditPage />} />
            {/* Old paths. */}
            <Route path="orders" element={<Navigate to="/app/activity" replace />} />
            <Route path="policies" element={<Navigate to="/app/policy" replace />} />
            <Route path="playbook" element={<Navigate to="/app/policy/graph" replace />} />
            <Route path="profile/*" element={<UserSettings />} />
            <Route path="organization/*" element={<OrganizationIndex />} />
          </Route>
          <Route path="create-organization" element={<CreateOrganization />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionProvider>
  );
};

// Public entry point for invitation links. When the user is not authenticated,
// AcceptInvitation's anonymous mode redirects them to /signup?redirect=<this>;
// once they come back authenticated, the non-anonymous path auto-accepts the
// invite and routes into /app.
const PublicAcceptInvitation = () => {
  const { user } = useUser();
  return <AcceptInvitation anonymous={!user} />;
};

export default App;
