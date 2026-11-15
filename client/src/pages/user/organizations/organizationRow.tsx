import { Badge, Button, Table } from '@chakra-ui/react';
import { authClient } from '@/lib/auth-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Organization } from '@/types';
import { ConfirmPopover } from '@/components/ConfirmPopover';

const roleBadgeColor = {
  member: 'blue',
  admin: 'teal',
  owner: 'purple',
};

export const OrganizationRow = ({ organization, userId }: { organization: Organization; userId: string }) => {
  const queryClient = useQueryClient();
  const orgMembers = useQuery({
    queryKey: [`organization-members-${organization.id}`],
    queryFn: () =>
      authClient.organization.listMembers({
        query: {
          organizationId: organization.id,
        },
      }),
  });
  const userMember = orgMembers.data?.members.find((m) => m.user.id === userId);

  const leaveOrganizationMutation = useMutation({
    mutationFn: () =>
      authClient.organization.leave({
        organizationId: organization.id,
      }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      await authClient.organization.setActive({ organizationId: '' });
    },
  });

  return (
    <Table.Row>
      <Table.Cell>{organization.name}</Table.Cell>
      <Table.Cell>
        <Badge colorPalette={roleBadgeColor[userMember?.role as keyof typeof roleBadgeColor]}>{userMember?.role ?? '-'}</Badge>
      </Table.Cell>
      <Table.Cell>{organization.tier}</Table.Cell>
      <Table.Cell>{userMember?.createdAt.toLocaleString() ?? '-'}</Table.Cell>
      <Table.Cell>
        <ConfirmPopover
          title="Leave organization"
          description="Are you sure you want to leave this organization?"
          onConfirm={() => leaveOrganizationMutation.mutate()}
          confirmColor="red"
        >
          <Button colorPalette="red" size="xs" variant="outline">
            Leave
          </Button>
        </ConfirmPopover>
      </Table.Cell>
    </Table.Row>
  );
};
