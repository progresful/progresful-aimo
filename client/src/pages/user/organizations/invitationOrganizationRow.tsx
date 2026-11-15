import { Badge, Button, Flex, Table } from '@chakra-ui/react';
import { authClient } from '@/lib/auth-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Invitation } from '@/types';
import { ConfirmPopover } from '@/components/ConfirmPopover';

const statusBadgeColor = {
  pending: 'purple',
  accepted: 'green',
  rejected: 'red',
  canceled: 'orange',
};

export const InvitationOrganizationRow = ({ invitation }: { invitation: Invitation }) => {
  const queryClient = useQueryClient();

  const acceptInvitationMutation = useMutation({
    mutationFn: (invitationId: string) =>
      authClient.organization.acceptInvitation({
        invitationId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const rejectInvitationMutation = useMutation({
    mutationFn: (invitationId: string) =>
      authClient.organization.rejectInvitation({
        invitationId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-invitations'] });
    },
  });

  return (
    <Table.Row key={invitation.id}>
      <Table.Cell>{invitation.organizationName}</Table.Cell>
      <Table.Cell>{invitation.role}</Table.Cell>
      <Table.Cell>
        <Badge colorPalette={statusBadgeColor[invitation.status as keyof typeof statusBadgeColor]}>{invitation.status}</Badge>
      </Table.Cell>
      <Table.Cell>{invitation.expiresAt.toLocaleString()}</Table.Cell>
      <Table.Cell>
        {invitation.status === 'pending' ? (
          <Flex gap={2} alignItems="center">
            <Button colorPalette="green" size="xs" onClick={() => acceptInvitationMutation.mutate(invitation.id)} variant="outline">
              Accept
            </Button>
            <ConfirmPopover
              title="Reject invitation"
              description="Are you sure you want to reject this invitation?"
              onConfirm={() => rejectInvitationMutation.mutate(invitation.id)}
              confirmColor="red"
            >
              <Button colorPalette="red" size="xs" variant="outline">
                Reject
              </Button>
            </ConfirmPopover>
          </Flex>
        ) : (
          '-'
        )}
      </Table.Cell>
    </Table.Row>
  );
};
