import { authClient, useSession } from '@/lib/auth-client';
import { websocketService } from '@/services/websocket';
import { Team } from '@/types';
import { useMutation, UseMutationResult, useQuery, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { Organization } from 'better-auth/plugins/organization';
import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

type OrganizationContextType = {
  userIsAdminInOrganization: boolean;
  userIsOwnerInOrganization: boolean;
  changeOrganizationMutation: UseMutationResult<Organization, Error, string>;
  activeOrganizationId: string | undefined | null;
  activeOrganization: Organization | undefined | null;
  organizations: UseQueryResult<Organization[], Error>;
  members: UseQueryResult<{ members: Member[]; total: number }, Error>;
  teams: UseQueryResult<Team[], Error>;
};

type UserContextType = {
  user?: NonNullable<ReturnType<typeof useSession>['data']>['user'];
  session?: NonNullable<ReturnType<typeof useSession>['data']>['session'];
};

type SessionContextType = OrganizationContextType;

export type Member = {
  id: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
  };
  role: string | string[];
  createdAt: Date;
};

const SessionContext = createContext<SessionContextType | undefined>(undefined);

interface SessionProviderProps {
  children: ReactNode;
}

// SessionProvider is a thin passthrough mounted at the app root. It does not
// gate rendering — the user session is exposed via useUser(), and protected
// routes (/app/*) wrap their subtree in <AppGate /> below for auth + org
// context.
export const SessionProvider: React.FC<SessionProviderProps> = ({ children }) => {
  return <>{children}</>;
};

// AppGate guards the protected /app/* subtree:
//   - redirects to /login?redirect=<original> if no session,
//   - forces /app/create-organization if the user has no organizations,
//   - provides the useOrganization() context to authed descendants,
//   - connects the websocket once an active organization is known.
// Render it as the element for the /app/* parent route and put an <Outlet />
// or children beneath it.
export const AppGate: React.FC<{ children?: ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const { data: userData, isPending: isLoading } = useSession();
  const location = useLocation();
  const activeOrganizationId = userData?.session.activeOrganizationId;

  const changeOrganizationMutation = useMutation({
    mutationFn: (id: string) => {
      websocketService.disconnect();
      return authClient.organization.setActive({ organizationId: id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`organization-members`] });
      queryClient.invalidateQueries({ queryKey: [`organization-teams`] });
    },
  });

  const organizations = useQuery({
    queryKey: [`organizations`],
    queryFn: () => authClient.organization.list(),
    retry: false,
    enabled: !!userData?.user,
  });

  const members = useQuery({
    queryKey: [`organization-members`],
    queryFn: () => authClient.organization.listMembers({ query: { organizationId: activeOrganizationId! } }),
    retry: false,
    enabled: !!userData?.user && !!activeOrganizationId,
  });

  const teams = useQuery({
    queryKey: [`organization-teams`],
    queryFn: () => authClient.organization.listTeams({ query: { organizationId: activeOrganizationId! } }),
    retry: false,
    enabled: !!userData?.user && !!activeOrganizationId,
  });

  const activeOrganization = (organizations?.data as Organization[])?.find((organization) => organization.id === activeOrganizationId);
  const userIsAdminInOrganization =
    members.data?.members.some((member) => member.user.id === userData?.user?.id && member.role === 'admin') ?? false;
  const userIsOwnerInOrganization =
    members.data?.members.some((member) => member.user.id === userData?.user?.id && member.role === 'owner') ?? false;

  useEffect(() => {
    const setActiveOrganization = async () => {
      const orgs = await authClient.organization.list();
      const firstOrgId = orgs[0]?.id;
      if (firstOrgId) {
        await authClient.organization.setActive({
          organizationId: firstOrgId,
        });
      }
    };
    if (userData?.user) {
      if (!activeOrganizationId) {
        setActiveOrganization();
      } else if (activeOrganizationId && !websocketService.isConnected) {
        websocketService.connect();
      }
    }
  }, [userData?.user, activeOrganizationId]);

  if (isLoading) {
    return null;
  }

  if (!userData?.user) {
    const target = `${location.pathname}${location.search}`;
    const suffix = target && target !== '/' ? `?redirect=${encodeURIComponent(target)}` : '';
    return <Navigate to={`/login${suffix}`} replace />;
  }

  if (organizations.isPending) {
    return null;
  }

  const needsOrg = !organizations.data?.length;
  const onCreateOrgRoute = location.pathname === '/app/create-organization';
  if (needsOrg && !onCreateOrgRoute) {
    return <Navigate to="/app/create-organization" replace />;
  }

  const value: SessionContextType = {
    userIsAdminInOrganization,
    userIsOwnerInOrganization,
    changeOrganizationMutation,
    activeOrganizationId,
    activeOrganization,
    organizations,
    members,
    teams,
  };

  return (
    <SessionContext.Provider key={activeOrganizationId} value={value}>
      {children ?? <Outlet />}
    </SessionContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useOrganization = (): OrganizationContextType => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useOrganization must be used within AppGate');
  }
  return {
    userIsAdminInOrganization: context.userIsAdminInOrganization,
    userIsOwnerInOrganization: context.userIsOwnerInOrganization,
    changeOrganizationMutation: context.changeOrganizationMutation,
    activeOrganizationId: context.activeOrganizationId,
    activeOrganization: context.activeOrganization,
    organizations: context.organizations,
    members: context.members,
    teams: context.teams,
  };
};

// eslint-disable-next-line react-refresh/only-export-components
export const useUser = (): UserContextType => {
  const { data } = useSession();
  return { user: data?.user, session: data?.session };
};
