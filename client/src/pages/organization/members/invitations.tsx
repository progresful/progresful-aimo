import { authClient } from '@/lib/auth-client';
import { useOrganization } from '@/providers/session';
import { Avatar, Badge, Button, Flex, Table, Text } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InviteMember } from './inviteMember';
import { ConfirmPopover } from '@/components/ConfirmPopover';

const statusBadgeColor = {
  pending: 'purple',
  accepted: 'green',
  rejected: 'red',
  canceled: 'orange',
};

export const OrganizationInvitations = () => {
  const queryClient = useQueryClient();
  const { activeOrganizationId, members, userIsOwnerInOrganization, userIsAdminInOrganization } = useOrganization();
  const canInviteMember = userIsOwnerInOrganization || userIsAdminInOrganization;

  const invitations = useQuery({
    queryKey: ['organization-invitations'],
    queryFn: () =>
      authClient.organization.listInvitations({
        query: {
          organizationId: activeOrganizationId!,
        },
      }),
  });

  const revokeInvitationMutation = useMutation({
    mutationFn: (invitationId: string) => authClient.organization.cancelInvitation({ invitationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-invitations'] });
    },
  });

  const disabledActions = revokeInvitationMutation.isPending;

  return (
    <Flex direction="column" marginTop={16}>
      <Flex marginTop={4} marginBottom={2} justifyContent="space-between" gap={4} alignItems="center">
        <Text marginBottom={2} color="fg.muted">
          Invitations
        </Text>
        {canInviteMember && <InviteMember disabled={disabledActions} />}
      </Flex>
      <Table.ScrollArea>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Email</Table.ColumnHeader>
            <Table.ColumnHeader>Role</Table.ColumnHeader>
            <Table.ColumnHeader>Status</Table.ColumnHeader>
            <Table.ColumnHeader>Team</Table.ColumnHeader>
            <Table.ColumnHeader>Invited by</Table.ColumnHeader>
            <Table.ColumnHeader>Expires at</Table.ColumnHeader>
            <Table.ColumnHeader>Actions</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {invitations.data?.map((invitation) => {
            const inviter = members.data?.members.find((m) => m.user.id === invitation.inviterId);
            return (
              <Table.Row key={invitation.id}>
                <Table.Cell>{invitation.email}</Table.Cell>
                <Table.Cell>{invitation.role}</Table.Cell>
                <Table.Cell>
                  <Badge colorPalette={statusBadgeColor[invitation.status as keyof typeof statusBadgeColor]}>{invitation.status}</Badge>
                </Table.Cell>
                <Table.Cell>{invitation.teamId}</Table.Cell>
                <Table.Cell>
                  <Flex gap={2} alignItems="center">
                    <Avatar.Root width="20px" height="20px">
                      <Avatar.Fallback />
                      {inviter?.user.image ? <Avatar.Image src={inviter.user.image ?? ''} /> : null}
                    </Avatar.Root>
                    {inviter?.user.name}
                  </Flex>
                </Table.Cell>
                <Table.Cell>{invitation.expiresAt.toLocaleString()}</Table.Cell>
                <Table.Cell>
                  {invitation.status === 'pending' ? (
                    <ConfirmPopover
                      title="Revoke invitation"
                      description="Are you sure you want to revoke this invitation?"
                      onConfirm={() => revokeInvitationMutation.mutate(invitation.id)}
                      confirmColor="red"
                    >
                      <Button variant="outline" colorPalette="red" size="xs" disabled={disabledActions}>
                        Revoke
                      </Button>
                    </ConfirmPopover>
                  ) : (
                    '-'
                  )}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
      </Table.ScrollArea>
    </Flex>
  );
};
