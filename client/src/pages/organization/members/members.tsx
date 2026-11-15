import { ConfirmPopover } from '@/components/ConfirmPopover';
import { toaster } from '@/components/ui/toaster';
import { authClient, useSession } from '@/lib/auth-client';
import { useOrganization } from '@/providers/session';
import { Avatar, Badge, Box, Button, EmptyState, Flex, Stack, Table, Text, VStack } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LuUsers } from 'react-icons/lu';
import { OrganizationInvitations } from './invitations';

const roleBadgeColor = {
  member: 'blue',
  admin: 'teal',
  owner: 'purple',
};

const getInitials = (name?: string | null, email?: string | null) => {
  if (name) {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
  return email?.[0]?.toUpperCase() ?? '?';
};

export const OrganizationMembers = () => {
  const queryClient = useQueryClient();
  const { members, userIsOwnerInOrganization, userIsAdminInOrganization, activeOrganizationId } = useOrganization();
  const { data: userData } = useSession();
  const isOwnerOrAdmin = userIsOwnerInOrganization || userIsAdminInOrganization;

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => {
      if (!isOwnerOrAdmin) {
        return Promise.reject(new Error('You are not authorized to remove members'));
      }
      return authClient.organization.removeMember({
        memberIdOrEmail: memberId,
        organizationId: activeOrganizationId!,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      toaster.create({ title: 'Member removed', type: 'success' });
    },
    onError: (err) => {
      toaster.create({ title: 'Failed to remove member', description: err.message, type: 'error' });
    },
  });

  const memberList = members.data?.members ?? [];
  const pendingMemberId = removeMemberMutation.variables;

  return (
    <Stack gap={6} marginTop={4}>
      <Box>
        <Text color="fg.muted">Manage your organization members here.</Text>
      </Box>

      {memberList.length === 0 ? (
        <EmptyState.Root>
          <EmptyState.Content>
            <EmptyState.Indicator>
              <LuUsers />
            </EmptyState.Indicator>
            <VStack textAlign="center">
              <EmptyState.Title>No members yet</EmptyState.Title>
              <EmptyState.Description>Invite teammates below to get started.</EmptyState.Description>
            </VStack>
          </EmptyState.Content>
        </EmptyState.Root>
      ) : (
        <Table.ScrollArea>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Name</Table.ColumnHeader>
                <Table.ColumnHeader>Email</Table.ColumnHeader>
                <Table.ColumnHeader>Role</Table.ColumnHeader>
                {isOwnerOrAdmin && <Table.ColumnHeader textAlign="end">Actions</Table.ColumnHeader>}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {memberList.map((member) => {
                const isSelf = member.user.id === userData?.user?.id;
                const isRemoving = removeMemberMutation.isPending && pendingMemberId === member.id;
                return (
                  <Table.Row key={member.id}>
                    <Table.Cell>
                      <Flex gap={2} alignItems="center">
                        <Avatar.Root size="xs">
                          <Avatar.Fallback name={member.user.name ?? member.user.email}>
                            {getInitials(member.user.name, member.user.email)}
                          </Avatar.Fallback>
                          {member.user.image ? <Avatar.Image src={member.user.image} /> : null}
                        </Avatar.Root>
                        {member.user.name || <Text color="fg.muted">—</Text>}
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>{member.user.email}</Table.Cell>
                    <Table.Cell>
                      <Badge colorPalette={roleBadgeColor[member.role as keyof typeof roleBadgeColor]}>{member.role}</Badge>
                    </Table.Cell>
                    {isOwnerOrAdmin && (
                      <Table.Cell textAlign="end">
                        <ConfirmPopover
                          title={isSelf ? 'Leave organization' : 'Remove member'}
                          description={
                            isSelf
                              ? 'Are you sure you want to leave this organization?'
                              : 'Are you sure you want to remove this member from the organization?'
                          }
                          onConfirm={() => removeMemberMutation.mutate(member.id)}
                          confirmColor="red"
                        >
                          <Button variant="outline" colorPalette="red" size="xs" loading={isRemoving}>
                            {isSelf ? 'Leave' : 'Remove'}
                          </Button>
                        </ConfirmPopover>
                      </Table.Cell>
                    )}
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>
        </Table.ScrollArea>
      )}

      {isOwnerOrAdmin && <OrganizationInvitations />}
    </Stack>
  );
};
