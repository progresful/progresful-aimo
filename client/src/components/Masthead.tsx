// The app's masthead: the device's top bar — the glyph, the nav as a segmented control,
// a strip of status lights (Valio link, sandbox, signing key), the orange "+ New order"
// key, the theme switch and the org / account menu. Pages get the full width under it.
import { authClient } from '@/lib/auth-client';
import { useOrganization, useUser } from '@/providers/session';
import { Box, Menu as ChakraMenu, Flex, Portal, Text } from '@chakra-ui/react';
import { useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LuChevronDown, LuPlus } from 'react-icons/lu';
import { useApprovals, useHealth } from '@/api/gateway';
import { Tooltip } from '@/components/ui/tooltip';
import { Dot } from './kit';
import { Menu, MenuItem } from './Menu';
import { Logo } from './Logo';
import { SandboxChip } from './SandboxChip';
import { ThemeToggle } from './ThemeToggle';

type NavEntry = { to: string; label: string; end?: boolean };

// The four places a buyer works in.
const main: NavEntry[] = [
  { to: '/app', label: 'Home', end: true },
  { to: '/app/approvals', label: 'Approvals' },
  { to: '/app/policy', label: 'Rules' },
  { to: '/app/activity', label: 'Orders' },
];

// Gateway internals, folded away under "More".
const more: NavEntry[] = [
  { to: '/app/agents', label: 'Agents & keys' },
  { to: '/app/catalog', label: 'Catalog' },
  { to: '/app/audit', label: 'Audit log' },
];

const usePendingCount = (enabled: boolean) => {
  const { data } = useApprovals({ status: 'pending' });
  return enabled ? (data?.length ?? 0) : 0;
};

/** One segment of the nav control; the page you're on is the dark (lit) segment. */
const segStyle = (active: boolean) =>
  ({
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    height: '28px',
    paddingX: 3,
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: '500',
    letterSpacing: '-0.005em',
    whiteSpace: 'nowrap',
    bg: active ? 'bg.inverted' : 'transparent',
    color: active ? 'fg.inverted' : 'fg.muted',
    transition: 'background 0.15s, color 0.15s',
    _hover: active ? undefined : { color: 'fg', bg: 'bg.hover' },
  }) as const;

const NavItem = ({ to, label, end }: NavEntry) => {
  // Live count of approvals waiting for a person, straight from the gateway.
  const pending = usePendingCount(to === '/app/approvals');
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <Box {...segStyle(isActive)}>
          {label}
          {pending ? (
            <Flex as="span" align="center" gap={1} fontFamily="mono" fontSize="11px" fontWeight="600" color={isActive ? 'fg.inverted' : 'status.pending'}>
              <Dot tone="pending" size={6} />
              {pending}
            </Flex>
          ) : null}
        </Box>
      )}
    </NavLink>
  );
};

const MoreMenu = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const active = more.some((m) => location.pathname.startsWith(m.to));
  const current = more.find((m) => location.pathname.startsWith(m.to));
  return (
    <ChakraMenu.Root positioning={{ placement: 'bottom-start' }} onSelect={({ value }) => navigate(value)}>
      <ChakraMenu.Trigger asChild>
        <Box as="button" cursor="pointer" {...segStyle(active)}>
          {current ? current.label : 'More'} <LuChevronDown />
        </Box>
      </ChakraMenu.Trigger>
      <Portal>
        <ChakraMenu.Positioner>
          <ChakraMenu.Content minWidth="180px">
            {more.map((m) => (
              <ChakraMenu.Item key={m.to} value={m.to}>
                {m.label}
              </ChakraMenu.Item>
            ))}
          </ChakraMenu.Content>
        </ChakraMenu.Positioner>
      </Portal>
    </ChakraMenu.Root>
  );
};

export const Masthead = () => (
  <Flex
    as="header"
    align="center"
    gap={{ base: 3, xl: 4 }}
    height="54px"
    paddingX={5}
    bg="bg"
    borderBottomWidth="1px"
    borderColor="border.strong"
    flexShrink={0}
  >
    <NavLink to="/app" aria-label="AI-MO home">
      <Logo size={24} sub={false} />
    </NavLink>
    <Flex
      as="nav"
      align="center"
      gap="2px"
      padding="2px"
      marginLeft={{ base: 1, xl: 3 }}
      borderWidth="1px"
      borderColor="border.strong"
      borderRadius="l2"
      bg="bg.panel"
    >
      {main.map((item) => (
        <NavItem key={item.to} {...item} />
      ))}
      <MoreMenu />
    </Flex>
    <Box flex={1} />
    <StatusStrip />
    <NewOrderButton />
    <Flex align="center" gap={1}>
      <ThemeToggle />
      <OrgMenu />
    </Flex>
  </Flex>
);

// The one way in to create an order: the orange key.
const NewOrderButton = () => (
  <NavLink to="/app/new">
    <Flex
      align="center"
      gap={1.5}
      height="30px"
      paddingX={3}
      borderRadius="l2"
      borderWidth="1px"
      borderColor="key.edge"
      bg="brand.solid"
      color="brand.contrast"
      boxShadow="key"
      fontSize="13px"
      fontWeight="600"
      whiteSpace="nowrap"
      _hover={{ bg: 'brand.solidHover' }}
      _active={{ transform: 'translateY(2px)', boxShadow: 'none' }}
      transition="background 0.12s, transform 0.12s, box-shadow 0.12s"
    >
      <LuPlus /> New order
    </Flex>
  </NavLink>
);

/** Device status lights: the Valio link, the sandbox (with Try it / Reset), the signing key. */
const StatusStrip = () => {
  const { data: health, isLoading, isError } = useHealth();
  const up = !!health?.ok && health.valio.ok;
  const tone = isLoading ? 'idle' : up ? 'auto' : 'blocked';
  const label = isLoading
    ? 'Valio …'
    : isError || !health
      ? 'Offline'
      : !up
        ? 'Valio down'
        : health.valio.mode === 'live'
          ? 'Valio live'
          : 'Simulator';
  const kid = health?.signing.kid;
  return (
    <Flex align="center" gap={4} textStyle="label" color="fg.muted" whiteSpace="nowrap" display={{ base: 'none', lg: 'flex' }}>
      <Tooltip content={health?.valio.latencyMs != null ? `Valio Aimo answered in ${health.valio.latencyMs} ms` : 'Gateway health'} showArrow>
        <Flex align="center" gap={1.5}>
          <Dot tone={tone} size={6} />
          {label}
        </Flex>
      </Tooltip>
      <SandboxChip />
      {kid ? (
        <Tooltip content={`Decisions are signed with ${health?.signing.algorithm ?? 'ed25519'} key ${kid}`} showArrow>
          <Text color="fg.subtle" css={{ display: 'none', '@media (min-width: 1400px)': { display: 'block' } }}>
            Key {kid.split('-').at(-1)?.slice(0, 8)}
          </Text>
        </Tooltip>
      ) : null}
    </Flex>
  );
};

// Org switcher + account actions in one menu.
const OrgMenu = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const {
    organizations,
    changeOrganizationMutation,
    activeOrganizationId,
    activeOrganization,
    userIsOwnerInOrganization,
    userIsAdminInOrganization,
  } = useOrganization();

  const items = useMemo<MenuItem[]>(() => {
    const organizationItems = (organizations.data ?? []).map((organization) => ({
      value: organization.id,
      label: organization.name,
    }));

    const list: MenuItem[] = [];

    // Only show org switcher when user belongs to multiple orgs.
    if (organizationItems.length > 1) {
      list.push(...organizationItems);
      list.push({ isSeparator: true });
    }

    list.push({ value: 'user-profile', label: 'Profile' });

    if (userIsOwnerInOrganization || userIsAdminInOrganization) {
      list.push({ value: 'organization', label: 'Organization' });
    }

    list.push({ value: 'organization-create', label: 'Create new organization' });
    list.push({ isSeparator: true });
    list.push({ value: 'logout', label: 'Log out' });

    return list;
  }, [organizations.data, userIsOwnerInOrganization, userIsAdminInOrganization]);

  function handleMenuChange({ value }: { value: string }) {
    switch (value) {
      case 'user-profile':
        navigate('/app/profile');
        return;
      case 'organization':
        navigate('/app/organization');
        return;
      case 'organization-create':
        navigate('/app/create-organization');
        return;
      case 'logout':
        authClient.signOut({ fetchOptions: { onSuccess: () => navigate('/') } });
        return;
      default:
        if (value) changeOrganizationMutation.mutate(value);
    }
  }

  const orgName = activeOrganization?.name ?? 'No organization';

  return (
    <Box maxWidth={{ base: '150px', xl: '210px' }}>
      <Menu
        title={
          <Flex align="center" gap={2} width="100%" textAlign="left">
            <Flex
              position="relative"
              align="center"
              justify="center"
              width="24px"
              height="24px"
              borderRadius="l1"
              bg="bg.emphasized"
              color="fg"
              fontFamily="mono"
              fontSize="12px"
              fontWeight="600"
              flexShrink={0}
            >
              {orgName.slice(0, 1).toUpperCase()}
            </Flex>
            <Text fontSize="13px" fontWeight="500" color="fg" truncate minWidth={0} flex={1} title={user?.email}>
              {orgName}
            </Text>
            <Box color="fg.subtle" fontSize="12px">
              <LuChevronDown />
            </Box>
          </Flex>
        }
        selected={activeOrganizationId ?? undefined}
        items={items}
        onChange={handleMenuChange}
        placement="bottom-end"
      />
    </Box>
  );
};
